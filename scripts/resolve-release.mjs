/**
 * Latest stable Euro-Office release resolution. Asset filename is not an identity.
 * A candidate must be an official GitHub .deb attached to this release;
 * dpkg-deb validates package NAME/VERSION/ARCHITECTURE after download.
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const API='https://api.github.com/repos/Euro-Office/DocumentServer/releases';
const TAG=/^v\d+\.\d+\.\d+(?:-(?:rc|beta|alpha|hotfix)\.[A-Za-z0-9.-]+)?$/;
const HEX=/^sha256:([a-f0-9]{64})$/i;
export function validateTag(tag){ if(typeof tag!=='string'||!TAG.test(tag))throw Error(`Invalid release tag: ${tag}`); return tag; }
export function candidatesFor(data){
  return (Array.isArray(data?.assets)?data.assets:[]).filter(a=>
    typeof a.name==='string' && /^[A-Za-z0-9_.+~-]+\.deb$/.test(a.name) &&
    Number.isSafeInteger(a.size) && a.size>100_000_000);
}
export function selectRelease(data,requested=''){
  if(!data||data.draft||!data.tag_name)throw Error('Release is absent or draft');
  const tag=validateTag(data.tag_name);
  if(requested&&tag!==requested)throw Error(`Requested ${requested}, got ${tag}`);
  if(!requested&&data.prerelease)throw Error('Latest release is a prerelease');
  const assets=Array.isArray(data.assets)?data.assets:[];
  const candidates=candidatesFor(data);
  if(candidates.length!==1)throw Error(`Expected exactly one large .deb asset; found ${candidates.length}. Published assets: ${assets.map(a=>a.name).join(', ')||'(none)'}. Refusing to guess.`);
  const asset=candidates[0];
  const url=new URL(asset.browser_download_url);
  const expected=`/Euro-Office/DocumentServer/releases/download/${tag}/${asset.name}`;
  if(url.protocol!=='https:'||url.hostname!=='github.com'||decodeURIComponent(url.pathname)!==expected||url.search||url.hash)throw Error('Release asset URL is not the expected official GitHub location');
  const digest=asset.digest||'';
  if(digest&&!HEX.test(digest))throw Error('Unsupported asset digest');
  return {
    tag,version:tag.slice(1),name:asset.name,url:url.href,size:asset.size,
    sha256:digest?HEX.exec(digest)[1].toLowerCase():'',assetId:asset.id||null,
    publishedAt:data.published_at||'', converterPolicy:'COMPILE_FROM_EXACT_RELEASE_CORE'
  };
}
export async function fetchRelease({requestedTag='',token='',fetchImpl=fetch}={}){
  if(requestedTag)validateTag(requestedTag);
  const url=requestedTag?`${API}/tags/${requestedTag}`:`${API}/latest`;
  const headers={Accept:'application/vnd.github+json','User-Agent':'EuroOffice-Ranuts-Approach-B','X-GitHub-Api-Version':'2022-11-28'};
  if(token)headers.Authorization=`Bearer ${token}`;
  const response=await fetchImpl(url,{headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`GitHub API HTTP ${response.status}`);
  return selectRelease(await response.json(),requestedTag);
}
async function main(){
  const selection=await fetchRelease({requestedTag:(process.env.EO_REQUESTED_TAG||'').trim(),token:process.env.GH_TOKEN||''});
  const target=resolve('.work/release-selection.json');
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,JSON.stringify(selection,null,2)+'\n');
  if(process.env.GITHUB_ENV){
    const values={EO_RELEASE_TAG:selection.tag,EO_RELEASE_VERSION:selection.version,
      EO_DEB_NAME:selection.name,EO_DEB_URL:selection.url,EO_RELEASE_ASSET_SHA256:selection.sha256};
    await appendFile(process.env.GITHUB_ENV,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
  }
  console.log(`Selected ${selection.tag} => ${selection.name}; package identity and architecture will be checked by dpkg-deb.`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('RELEASE RESOLUTION FAILED:',e.message);process.exitCode=1;});
