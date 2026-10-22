import Link from "next/link";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/supabase/server";
import {SCENE_IMAGE_BUCKET,sceneImageAdmin} from "@/lib/ai/scene-image";
import SceneImagePanel from "./panel";
export const dynamic="force-dynamic";
export default async function SceneImagesPage({params}:{params:Promise<{sermonId:string}>}){
 const {sermonId}=await params;
 if(!/^[a-f0-9-]{36}$/i.test(sermonId))notFound();
 const {db,user}=await requireUser();
 const {data:sermon}=await db.from("sermons").select("id,title,church_id,source_version,analysis_version").eq("id",sermonId).maybeSingle();
 if(!sermon)notFound();
 const {data:member}=await db.from("church_memberships").select("role").eq("church_id",sermon.church_id).eq("user_id",user.id).eq("active",true).maybeSingle();
 if(!member)notFound();
 const {data:analysis}=await db.from("sermon_analyses").select("data,source_version").eq("sermon_id",sermon.id).maybeSingle();
 const scenes=analysis?.source_version===sermon.source_version && Array.isArray(analysis.data?.scenes)?
 analysis.data.scenes.filter((s:unknown)=>typeof s==="object"&&s!==null&&"visual_description" in s) as Array<{scene_id:number;summary:string;visual_description:string}>:[];
 const {data:rows}=await db.from("sermon_scene_images").select("id,scene_id,status,storage_path,created_at,error_code,source_version,analysis_version").eq("sermon_id",sermon.id).order("created_at",{ascending:false}).limit(30);
 const admin=sceneImageAdmin();
 const images=await Promise.all((rows??[]).filter(i=>i.source_version===sermon.source_version&&i.analysis_version===sermon.analysis_version).map(async i=>{
  const signed=i.storage_path?await admin.storage.from(SCENE_IMAGE_BUCKET).createSignedUrl(i.storage_path,300):null;
  return {id:i.id,scene_id:i.scene_id,status:i.status,created_at:i.created_at,error_code:i.error_code,url:signed?.data?.signedUrl??null};
 }));
 return <><header><Link href="/dashboard" className="brand">SermonBridge <span>AI</span></Link><nav><Link href="/dashboard">설교 관리</Link></nav></header>
 <main><p className="eyebrow">AI SERMON VISUALS · 교회 내부 검수용</p><h1>{sermon.title} — 장면 이미지</h1>
 <p className="notice">이 그림은 AI가 생성한 교육용 삽화입니다. 실제 역사 사진이나 목회자 발언으로 오인하지 않도록 검수하세요. 승인 전 외부 공개되지 않습니다.</p>
 {scenes.length?<SceneImagePanel sermonId={sermon.id} scenes={scenes} images={images} canApprove={["admin","pastor"].includes(member.role)}/>:<p className="notice">설교 분석 장면이 없습니다. 원고 분석을 먼저 완료하세요.</p>}
 </main></>;
}
