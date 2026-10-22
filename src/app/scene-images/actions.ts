"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { generateScenePng, sceneImageAdmin, sceneImageModel, SCENE_IMAGE_BUCKET } from "@/lib/ai/scene-image";
const id=z.string().uuid();
const input=z.object({sermon_id:id,scene_id:z.coerce.number().int().min(1).max(5)});
export type ImageActionResult={error?:string;success?:string};
export async function createSceneImage(_state:ImageActionResult,form:FormData):Promise<ImageActionResult>{
 const parsed=input.safeParse(Object.fromEntries(form));
 if(!parsed.success)return{error:"설교·장면 정보를 확인해 주세요."};
 let admin:ReturnType<typeof sceneImageAdmin>;
 try{admin=sceneImageAdmin();}catch{return{error:"서버 이미지 생성 설정이 완료되지 않았습니다."};}
 const {db,user}=await requireUser();
 const {data:sermon}=await db.from("sermons").select("id,church_id,source_version,analysis_version").eq("id",parsed.data.sermon_id).single();
 if(!sermon)return{error:"설교 접근 권한이 없습니다."};
 const {data:membership}=await db.from("church_memberships").select("role").eq("church_id",sermon.church_id).eq("user_id",user.id).eq("active",true).maybeSingle();
 if(!membership || !["admin","pastor","media"].includes(membership.role))return{error:"생성 권한이 없습니다."};
 const {data:analysis}=await db.from("sermon_analyses").select("data,source_version").eq("sermon_id",sermon.id).single();
 if(!analysis || analysis.source_version!==sermon.source_version)return{error:"현재 원고의 AI 분석부터 완료해 주세요."};
 const scene=Array.isArray(analysis.data?.scenes)?analysis.data.scenes.find((s:{scene_id:number})=>s.scene_id===parsed.data.scene_id):null;
 if(!scene?.visual_description || typeof scene.visual_description!=="string")return{error:"장면 설명이 없습니다."};
 const prompt=scene.visual_description as string;
 // The service-role reservation validates membership, revision, prompt equality,
 // per-user quota, and duplicate image jobs inside a locked transaction.
 const {data:jobId,error:reserveError}=await admin.rpc("reserve_scene_image",{
  target:sermon.id,actor:user.id,requested_scene:parsed.data.scene_id,
  expected_source:sermon.source_version,expected_analysis:sermon.analysis_version,
  requested_prompt:prompt,requested_model:sceneImageModel()
 });
 if(reserveError || !jobId)return{error:"중복 요청·권한·사용량 한도 또는 오래된 분석을 확인해 주세요."};
 try{
  const bytes=await generateScenePng(prompt);
  const path=`${sermon.church_id}/${sermon.id}/${jobId}.png`;
  const {error:uploadError}=await admin.storage.from(SCENE_IMAGE_BUCKET).upload(path,bytes,{
   contentType:"image/png",upsert:false,cacheControl:"3600"
  });
  if(uploadError)throw new Error("IMAGE_UPLOAD_FAILED");
  const {error:finishError}=await admin.from("sermon_scene_images").update({
   status:"generated",storage_path:path,mime_type:"image/png",completed_at:new Date().toISOString()
  }).eq("id",jobId).eq("status","running");
  if(finishError)throw new Error("IMAGE_DATABASE_FAILED");
  revalidatePath(`/scene-images/${sermon.id}`);
  return{success:"장면 이미지 초안이 생성되었습니다. 목회자 검수가 필요합니다."};
 }catch(error){
  await admin.from("sermon_scene_images").update({
   status:"failed",error_code:error instanceof Error ? error.message.slice(0,60):"IMAGE_UNKNOWN_ERROR",
   completed_at:new Date().toISOString()
  }).eq("id",jobId).eq("status","running");
  return{error:"이미지 생성에 실패했습니다. 서버 설정과 모델 사용 한도를 확인해 주세요."};
 }
}
export async function approveSceneImage(_state:ImageActionResult,form:FormData):Promise<ImageActionResult>{
 const schema=z.object({image_id:id,sermon_id:id});
 const parsed=schema.safeParse(Object.fromEntries(form));
 if(!parsed.success)return{error:"이미지 선택이 올바르지 않습니다."};
 const {db,user}=await requireUser();
 const {data:entry}=await db.from("sermon_scene_images").select("id,church_id,sermon_id,source_version,analysis_version,status").eq("id",parsed.data.image_id).eq("sermon_id",parsed.data.sermon_id).single();
 if(!entry || entry.status!=="generated")return{error:"검수할 이미지가 없거나 이미 처리되었습니다."};
 const {data:member}=await db.from("church_memberships").select("role").eq("church_id",entry.church_id).eq("user_id",user.id).eq("active",true).maybeSingle();
 if(!member || !["admin","pastor"].includes(member.role))return{error:"목회자 또는 관리자만 승인할 수 있습니다."};
 const {data:sermon}=await db.from("sermons").select("source_version,analysis_version").eq("id",entry.sermon_id).single();
 if(!sermon || sermon.source_version!==entry.source_version || sermon.analysis_version!==entry.analysis_version)return{error:"원고·분석이 변경되어 이미지를 다시 검수해야 합니다."};
 const admin=sceneImageAdmin();
 const {error}=await admin.from("sermon_scene_images").update({
  status:"approved",approved_by:user.id,approved_at:new Date().toISOString()
 }).eq("id",entry.id).eq("status","generated");
 if(error)return{error:"승인을 저장하지 못했습니다."};
 revalidatePath(`/scene-images/${entry.sermon_id}`);
 return{success:"이미지 검수가 승인되었습니다."};
}
