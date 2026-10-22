"use client";
import {useActionState} from "react";
import {approveSceneImage,createSceneImage,type ImageActionResult} from "../actions";
type ImageInfo={id:string;scene_id:number;status:string;url:string|null;created_at:string;error_code:string|null};
type SceneInfo={scene_id:number;summary:string;visual_description:string};
const initial:ImageActionResult={};
function Generate({sermonId,sceneId}:{sermonId:string;sceneId:number}){
 const [state,action,pending]=useActionState(createSceneImage,initial);
 return <form action={action}><input type="hidden" name="sermon_id" value={sermonId}/><input type="hidden" name="scene_id" value={sceneId}/>
 <button disabled={pending} type="submit">{pending?"이미지 생성 중...":"이 장면 이미지 생성"}</button>
 {state.error&&<p role="alert">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}</form>;
}
function Approve({imageId,sermonId}:{imageId:string;sermonId:string}){
 const [state,action,pending]=useActionState(approveSceneImage,initial);
 return <form action={action}><input type="hidden" name="image_id" value={imageId}/><input type="hidden" name="sermon_id" value={sermonId}/>
 <button disabled={pending} type="submit">{pending?"승인 중...":"이 그림 승인"}</button>
 {state.error&&<p role="alert">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}</form>;
}
export default function SceneImagePanel({sermonId,scenes,images,canApprove}:{sermonId:string;scenes:SceneInfo[];images:ImageInfo[];canApprove:boolean}){
 return <div className="grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))"}}>
 {scenes.map(s=><section key={s.scene_id} className="card">
 <p className="eyebrow">SCENE {s.scene_id.toString().padStart(2,"0")}</p><h2>{s.summary}</h2>
 <p className="muted">이미지 생성 설명: {s.visual_description}</p>
 <Generate sermonId={sermonId} sceneId={s.scene_id}/>
 {images.filter(i=>i.scene_id===s.scene_id).map(i=><article key={i.id} style={{borderTop:"1px solid #ddd",marginTop:20,paddingTop:12}}>
 <p className="muted">{i.status==="approved"?"승인됨":i.status==="generated"?"검수 대기":i.status==="failed"?"생성 실패":"생성 중"} · {new Date(i.created_at).toLocaleString("ko-KR")}</p>
 {i.url&&<img src={i.url} alt={s.summary+" — AI가 생성한 교육용 삽화"} style={{width:"100%",aspectRatio:"16/9",objectFit:"contain",borderRadius:10}}/>}
 {i.status==="generated"&&canApprove&&<Approve imageId={i.id} sermonId={sermonId}/>}
 {i.status==="failed"&&<p role="status">재생성하려면 위 생성 버튼을 사용하세요.</p>}
 </article>)}
 </section>)}
 </div>;
}
