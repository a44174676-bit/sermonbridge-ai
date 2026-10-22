import "server-only";
import { createClient } from "@supabase/supabase-js";

export const SCENE_IMAGE_BUCKET = "sermon-scene-images";
const MODEL = "gemini-2.5-flash-image";

export function sceneImageModel() { return MODEL; }
export function sceneImageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.GEMINI_API_KEY) throw new Error("IMAGE_NOT_CONFIGURED");
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
export async function generateScenePng(description: string): Promise<Uint8Array> {
  if (!description || description.length > 3000) throw new Error("INVALID_DESCRIPTION");
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),85000);
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY!},
      signal: controller.signal,
      cache:"no-store",
      body:JSON.stringify({
        contents:[{role:"user",parts:[{text:
          "Produce one landscape 16:9 educational illustration for a Christian sermon. "+
          "No words, letters, logos, gore, or modern objects. Respect cultural and historical uncertainty. "+
          "Illustration only, not documentary evidence. Depict: "+description
        }]}],
        generationConfig:{responseModalities:["IMAGE"],imageConfig:{aspectRatio:"16:9"}}
      })
    });
    if(!response.ok)throw new Error(response.status===429?"IMAGE_RATE_LIMIT":"IMAGE_PROVIDER_FAILED");
    const json=await response.json() as {candidates?:Array<{content?:{parts?:Array<{inlineData?:{mimeType?:string;data?:string}}>} } >};
    const inline=json.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data)?.inlineData;
    if(!inline?.data || inline.mimeType!=="image/png")throw new Error("IMAGE_FORMAT_UNSUPPORTED");
    const bytes=Buffer.from(inline.data,"base64");
    if(bytes.length<100 || bytes.length>6291456)throw new Error("IMAGE_SIZE_REJECTED");
    return bytes;
  }catch(error){
    if(error instanceof Error && /^(IMAGE_|INVALID_)/.test(error.message))throw error;
    throw new Error("IMAGE_PROVIDER_FAILED");
  }finally{clearTimeout(timer);}
}
