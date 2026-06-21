import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import { logout, updateUser } from "../store/userSlice";
import { isProBillingEnabled } from "../utils/proGate";
import { useXiaowanziEmbeddedLayer } from "../utils/xiaowanziLayer";

type GlobalPublicNavProps = {
  showSearch?: boolean; showAiOnline?: boolean; showLogout?: boolean; compactMobile?: boolean;
  showProgramList?: boolean; showProgramEntry?: boolean; showExpertsEntry?: boolean; showBooksEntry?: boolean; showMaterialsEntry?: boolean; showPlanningEntry?: boolean;
  searchPlaceholder?: string; searchValue?: string; onSearchChange?: (value: string) => void;
  headless?: boolean;
};
type PanelMode = "menu" | "profile" | "children" | "memory" | "memoryManage" | "settings" | null;
type ChildStage = "学前" | "小学" | "初中" | "高中";
type ChildProfileLite = { id:string; relation:"儿子"|"女儿"; displayName:string; gender:"男"|"女"; birthDate:string; city?:string; region?:string; grade:string; concernTags:string[]; avatar:string; createdAt:string; draft?:boolean };
type ChildProfileDeletion = { id:string; removedAt:string };
type ChildMemoryItem = { id:string; text:string };

const CHILD_PROFILES_KEY = "xiaowanzi_child_profiles_v1";
const CHILD_PROFILE_DELETIONS_KEY = "xiaowanzi_child_profile_deletions_v1";
const CHAT_CONTEXT_KEY = "xiaowanzi_chat_context_v1";
const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const DEFAULT_MEMORY_CHILD_ID = "default";
const DEFAULT_CHILD_AVATAR = "/assets/wel-avatar/optimized/no-hat.webp";
const LOGGED_OUT_XIAOWANZI_AVATAR = "/assets/xiaowanzi-nohat.png";
const PUBLIC_NAV_IMAGE_ASSETS = ["/assets/logo.png", "/assets/jiyue-logo.png", DEFAULT_CHILD_AVATAR, LOGGED_OUT_XIAOWANZI_AVATAR] as const;
const preloadedPublicNavImages = new Set<string>();
const decodedPublicNavImages = new Map<string, HTMLImageElement>();
const CHILD_RELATIONS = ["儿子", "女儿"] as const;
const CHILD_TAGS = ["睡眠", "情绪", "专注力", "社交", "学习习惯", "亲子沟通"] as const;
const USER_GENDER_OPTIONS = ["男", "女"] as const;
const CHILD_STAGES: ChildStage[] = ["学前", "小学", "初中", "高中"];
const CHILD_GRADES_BY_STAGE: Record<ChildStage,string[]> = { 学前:["未入园","托班","小班","中班","大班"], 小学:["一年级","二年级","三年级","四年级","五年级","六年级"], 初中:["六年级（预初）","七年级","八年级","九年级"], 高中:["高一年级","高二年级","高三年级"] };
const WUSI_CITIES = ["上海","上海市","shanghai","威海","威海市","淄博","淄博市","莱芜","莱芜市","烟台","烟台市","哈尔滨","哈尔滨市","大庆","大庆市","青岛","青岛市"];
const DISTRICTS_BY_CITY: Record<string,string[]> = { 上海:["黄浦区","徐汇区","长宁区","静安区","普陀区","虹口区","杨浦区","闵行区","宝山区","嘉定区","浦东新区","金山区","松江区","青浦区","奉贤区","崇明区"], 北京:["东城区","西城区","朝阳区","丰台区","石景山区","海淀区","顺义区","通州区","大兴区","房山区","门头沟区","昌平区","平谷区","密云区","怀柔区","延庆区"], 广州:["越秀区","海珠区","荔湾区","天河区","白云区","黄埔区","南沙区","番禺区","花都区","增城区","从化区"], 深圳:["福田区","罗湖区","南山区","盐田区","宝安区","龙岗区","龙华区","坪山区","光明区"], 杭州:["上城区","拱墅区","西湖区","滨江区","余杭区","萧山区","临平区","钱塘区","富阳区","临安区"] };

function preloadPublicNavImage(src:string){
  if(!src||typeof document==="undefined"||preloadedPublicNavImages.has(src))return;
  preloadedPublicNavImages.add(src);
  if(!document.querySelector(`link[rel="preload"][as="image"][href="${src}"]`)){
    const link=document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = src;
    document.head.appendChild(link);
  }
  const image=decodedPublicNavImages.get(src)||new Image();
  image.loading = "eager";
  image.decoding = "sync";
  image.src = src;
  decodedPublicNavImages.set(src,image);
  image.decode?.().catch(()=>undefined);
}

function emptyChild(): ChildProfileLite { return { id: crypto.randomUUID(), relation:"儿子", displayName:"", gender:"男", birthDate:"", city:"", region:"", grade:"", concernTags:[], avatar:DEFAULT_CHILD_AVATAR, createdAt:new Date().toISOString() }; }
function childProfileTime(value?:string|null){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date.getTime():0}
function mergeChildProfileDeletions(base:ChildProfileDeletion[], incoming:ChildProfileDeletion[]){const map=new Map<string,ChildProfileDeletion>();[...base,...incoming].forEach(item=>{const id=String(item?.id||"").trim();if(!id)return;const next={id,removedAt:String(item?.removedAt||new Date(0).toISOString())};const current=map.get(id);if(!current||childProfileTime(next.removedAt)>=childProfileTime(current.removedAt))map.set(id,next)});return Array.from(map.values()).sort((a,b)=>childProfileTime(b.removedAt)-childProfileTime(a.removedAt)).slice(0,12)}
function loadChildProfileDeletions(): ChildProfileDeletion[] { try { const raw=JSON.parse(localStorage.getItem(CHILD_PROFILE_DELETIONS_KEY)||"[]"); return Array.isArray(raw)?mergeChildProfileDeletions([],raw.map((item:any)=>({id:String(item?.id||""),removedAt:String(item?.removedAt||new Date(0).toISOString())}))):[] } catch { return []; } }
function saveChildProfileDeletions(items: ChildProfileDeletion[]) { localStorage.setItem(CHILD_PROFILE_DELETIONS_KEY, JSON.stringify(items)); }
function isDeletedChildProfile(item:{id:string;createdAt?:string}, deletions:ChildProfileDeletion[]){const removed=deletions.find(entry=>entry.id===item.id);return !!removed&&childProfileTime(removed.removedAt)>=childProfileTime(item.createdAt)}
function loadChildren(): ChildProfileLite[] { try { const deletedIds=new Set(loadChildProfileDeletions().map(item=>item.id)); const raw = JSON.parse(localStorage.getItem(CHILD_PROFILES_KEY)||"[]"); return Array.isArray(raw) ? raw.map((x:any):ChildProfileLite=>({ id:String(x.id||crypto.randomUUID()), relation:x.relation==="女儿"?"女儿":"儿子", displayName:String(x.displayName||""), gender:x.gender==="女"||x.relation==="女儿"?"女":"男", birthDate:String(x.birthDate||""), city:String(x.city||""), region:String(x.region||""), grade:String(x.grade||""), concernTags:Array.isArray(x.concernTags)?x.concernTags.map(String).filter(Boolean):[], avatar:String(x.avatar||DEFAULT_CHILD_AVATAR), createdAt:String(x.createdAt||new Date().toISOString()), draft:!!x.draft })).filter(item=>!deletedIds.has(item.id)) : []; } catch { return []; } }
function currentMemoryChildId(){ const children=loadChildren(); const lastId=localStorage.getItem(LAST_CHILD_ID_KEY)||""; return children.find(item=>item.id===lastId)?.id||children[0]?.id||DEFAULT_MEMORY_CHILD_ID; }
function saveChildren(items: ChildProfileLite[]) { localStorage.setItem(CHILD_PROFILES_KEY, JSON.stringify(items)); }
function notifyChildrenUpdated() { document.dispatchEvent(new CustomEvent("xf-child-profiles-updated")); }
function parseGrade(raw:string): {stage:ChildStage; gradeName:string} { const t=String(raw||""); for (const s of CHILD_STAGES){ const g=CHILD_GRADES_BY_STAGE[s].find(v=>t.includes(v)||t===v); if(g) return {stage:s, gradeName:g}; } if(t.includes("小班")||t.includes("中班")||t.includes("大班")||t.includes("托班")||t.includes("未入园")) return {stage:"学前", gradeName:t.replace(/^学前/,"")||"小班"}; if(t.includes("小")) return {stage:"小学", gradeName:"一年级"}; if(t.includes("初")||t.includes("预初")) return {stage:"初中", gradeName:"六年级（预初）"}; if(t.includes("高")) return {stage:"高中", gradeName:"高一年级"}; return {stage:"学前", gradeName:"小班"}; }
function gradesFor(stage:ChildStage, city:string){ const wusi=WUSI_CITIES.some(v=>city.includes(v)); if(stage==="小学"&&wusi) return ["一年级","二年级","三年级","四年级","五年级"]; if(stage==="初中"&&wusi) return ["六年级（预初）","七年级","八年级","九年级"]; return CHILD_GRADES_BY_STAGE[stage]; }
function formatGrade(stage:ChildStage, gradeName:string){ if(stage==="学前") return `学前${gradeName}`; if(stage==="小学") return `小学${gradeName}`; if(stage==="初中") return `初中${gradeName.replace("（预初）","")}`; return gradeName; }
function childComplete(p:ChildProfileLite){ return !!p.relation && !!p.displayName && !!p.birthDate && !!p.grade; }
function isMiniProgramWebView(){ return typeof window!=="undefined" && (new URLSearchParams(window.location.search).get("xf_mp")==="1" || window.sessionStorage.getItem("xf_mp_webview")==="1"); }
type ChildSelectOption = { value:string; label:string };
function ChildSelect({id,value,options,placeholder="请选择",onChange}:{id:string;value:string;options:ChildSelectOption[];placeholder?:string;onChange:(value:string)=>void}){const [open,setOpen]=useState(false);const selected=options.find(x=>x.value===value);const choose=(next:string)=>{onChange(next);setOpen(false)};return <div className={`aip-profile-select ${open?"open":""}`} onBlur={()=>window.setTimeout(()=>setOpen(false),180)}><button id={id} type="button" className={`aip-profile-select-trigger ${selected?"":"placeholder"}`} onClick={()=>setOpen(v=>!v)} aria-haspopup="listbox" aria-expanded={open}><span>{selected?.label||placeholder}</span><span className="ms">expand_more</span></button>{open&&<div className="aip-profile-select-menu" role="listbox" aria-labelledby={id}>{options.map(option=><button key={option.value} type="button" className={`aip-profile-select-option ${option.value===value?"on":""}`} role="option" aria-selected={option.value===value} onPointerDown={e=>{e.preventDefault();e.stopPropagation();choose(option.value)}} onClick={()=>choose(option.value)}><span>{option.label}</span>{option.value===value&&<span className="ms">check</span>}</button>)}</div>}</div>}

function normalizeAvatarDataUrl(dataUrl:string):Promise<string>{return new Promise((resolve)=>{const image=new Image();image.onload=()=>{const maxSize=512;const scale=Math.min(1,maxSize/Math.max(image.width,image.height));const width=Math.max(1,Math.round(image.width*scale));const height=Math.max(1,Math.round(image.height*scale));const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d");if(!ctx){resolve(dataUrl);return}ctx.drawImage(image,0,0,width,height);const img=ctx.getImageData(0,0,width,height);const data=img.data;const seen=new Uint8Array(width*height);const queue:number[]=[];const isBg=(idx:number)=>{const p=idx*4,r=data[p],g=data[p+1],b=data[p+2],a=data[p+3];if(a<12)return true;const max=Math.max(r,g,b),min=Math.min(r,g,b);return a>180&&max>214&&max-min<42};const push=(idx:number)=>{if(idx<0||idx>=seen.length||seen[idx]||!isBg(idx))return;seen[idx]=1;queue.push(idx)};for(let x=0;x<width;x++){push(x);push((height-1)*width+x)}for(let y=0;y<height;y++){push(y*width);push(y*width+width-1)}for(let i=0;i<queue.length;i++){const idx=queue[i],x=idx%width,y=Math.floor(idx/width);push(idx-1);push(idx+1);if(y>0)push(idx-width);if(y<height-1)push(idx+width);if(x>0&&y>0)push(idx-width-1);if(x<width-1&&y>0)push(idx-width+1);if(x>0&&y<height-1)push(idx+width-1);if(x<width-1&&y<height-1)push(idx+width+1)}for(let idx=0;idx<seen.length;idx++){if(seen[idx])data[idx*4+3]=0}ctx.putImageData(img,0,0);resolve(canvas.toDataURL("image/png"))};image.onerror=()=>resolve(dataUrl);image.src=dataUrl})}

const CSS = `
#tb{height:52px;flex-shrink:0;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid rgba(17,10,8,.08);display:flex;align-items:center;z-index:100;padding:0 10px;gap:8px;overflow:visible}
.tb-logo{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 14px;cursor:pointer;transition:all .15s;height:calc(100% - 12px);border:1px solid transparent;border-radius:11px}
.tb-logo:hover{background:rgba(108,39,214,.05);border-color:rgba(108,39,214,.16)}
.tb-logo img{height:29px}
.tb-nav{display:flex;align-items:center;gap:2px;flex:1;height:100%;padding:0 4px;overflow:visible}
.tb-nav-btn{display:flex;align-items:center;gap:5px;height:100%;padding:0 12px;border:0;border-bottom:2px solid transparent;background:transparent;text-decoration:none;color:#6b7280;font-size:13px;font-weight:500;transition:all .15s;white-space:nowrap;position:relative}
.tb-nav-btn:hover{color:#111118}
.tb-nav-btn.on{color:#6c27d6;border-bottom-color:#6c27d6;font-weight:500;text-shadow:0 0 .4px #6c27d6}
.tb-nav-btn .ms{font-size:15px;width:16px;flex:0 0 16px;display:inline-flex;align-items:center;justify-content:center;font-variation-settings:'FILL' 0}
.tb-nav-btn.on .ms{font-variation-settings:'FILL' 1;color:#6c27d6}
.ms{font-family:'Material Symbols Rounded';font-size:19px;line-height:1}
.tb-nav-btn .jiyue-icon{width:16px;height:16px;flex:0 0 16px;display:block;object-fit:contain;transform:translateY(-0.5px)}
.jiyue-icon{width:20px;height:20px;object-fit:contain}
.tb-right{display:flex;align-items:center;gap:4px;padding:0 8px;flex-shrink:0}
.search-wrap{height:34px;width:230px;min-width:230px;border:1px solid rgba(17,10,8,.12);border-radius:999px;display:flex;align-items:center;gap:6px;padding:0 12px;background:#fff}
.search-wrap .ms{font-size:16px;color:#9ca3af}
.search-wrap input{border:0;outline:0;width:100%;background:transparent;font-size:13px;font-weight:400;color:#111118}
.search-wrap input::placeholder{color:#9ca3af}
.uc{border:1px solid rgba(17,10,8,.08);border-radius:20px;background:transparent;display:flex;align-items:center;gap:6px;padding:3px 10px 3px 5px;cursor:pointer;transition:all .12s;text-decoration:none}
.uc:hover{border-color:#6c27d6;background:rgba(108,39,214,.09)}
.uc-av{width:20px;height:20px;border-radius:5px;background:linear-gradient(135deg,#7c3aed,#ff2f8f);color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;overflow:hidden;flex:0 0 auto}
.uc-av img{width:100%;height:100%;object-fit:contain;display:block}
.uc-av.has-image{background:#fff}
.uc-name{font-size:11.5px;font-weight:600;color:#111118}
.ibtn{width:30px;height:30px;border:0;border-radius:7px;background:transparent;color:#6b7280;display:flex;align-items:center;justify-content:center;font-family:'Material Symbols Rounded';font-size:16px;font-variation-settings:'FILL' 0;transition:all .12s;cursor:pointer}
.ibtn:hover{background:rgba(108,39,214,.08);color:#6c27d6}
.desktop-account-menu{position:absolute;right:0;top:42px;width:218px;background:#fff;border-radius:18px;box-shadow:0 18px 42px rgba(15,23,42,.16);overflow:hidden;z-index:9400}
.desktop-account-menu .link{min-height:58px;padding:0 18px;gap:12px;color:#334155;font-size:13px;font-weight:500;line-height:1;background:#fff}
.desktop-account-menu .link span:not(.ms):not(.chev){font-size:13px;font-weight:500;line-height:1;color:inherit}
.desktop-account-menu .ms{font-family:'Material Symbols Rounded';font-size:21px;line-height:1;width:22px;flex:0 0 22px;display:inline-flex;align-items:center;justify-content:center;color:#334155;font-variation-settings:'FILL' 0}
.desktop-account-menu .chev{font-size:22px;font-weight:700;color:#94a3b8}
.mobile-actions{display:none;margin-left:auto;gap:18px}
.mobile-search,.mobile-toggle{border:0;background:transparent;color:#334155;font-family:'Material Symbols Rounded';font-size:26px;padding:0}
.mask{position:fixed;inset:0;z-index:9300;background:rgba(15,23,42,.58);backdrop-filter:blur(6px);display:flex;justify-content:flex-end}
.mask.xw-home-layer{z-index:9320}
.panel{position:relative;width:min(360px,74vw);height:100dvh;max-height:100dvh;box-sizing:border-box;background:#f7f7f8;overflow-y:auto;overflow-x:hidden;padding:24px 18px max(90px,calc(42px + env(safe-area-inset-bottom)));box-shadow:-18px 0 45px rgba(15,23,42,.2);animation:slide .2s cubic-bezier(.2,.9,.22,1);-webkit-overflow-scrolling:touch}
.panel.menu{width:min(360px,74vw);display:flex;flex-direction:column;gap:12px;padding:32px 18px 90px}
.panel.children{padding-top:24px;padding-bottom:18px}
.panel.settings{display:flex;flex-direction:column;padding-top:24px;padding-bottom:max(24px,calc(24px + env(safe-area-inset-bottom)))}
.card{background:#fff;border-radius:18px;overflow:hidden;margin-bottom:14px}
.panel.menu .card{border-radius:12px}
.panel.menu>.card,.panel.menu>.account{flex:0 0 auto}
.link,.account{width:100%;min-height:52px;border:0;background:#fff;padding:0 16px;display:flex;align-items:center;gap:10px;text-decoration:none;color:#334155;font-size:14px;font-weight:850;border-bottom:1px solid rgba(15,23,42,.06);cursor:pointer}
.link:last-child,.account:last-child{border-bottom:0}
.link.on{color:#6c27d6}
.chev{margin-left:auto;color:#94a3b8;font-size:20px;font-weight:700}
.account{min-height:72px}
.account small{display:block;color:#94a3b8;margin-top:3px;font-size:12px;font-weight:700}
.panel.menu>.account{border-radius:18px;overflow:hidden;padding-top:18px;padding-bottom:18px}
.panel.menu>.account .uc-av{width:60px;height:60px;flex-basis:60px}
.panel.menu>.account>span:not(.uc-av):not(.chev){display:flex;min-width:0;flex-direction:column;align-items:flex-start;text-align:left}
.panel.menu .link,.panel.menu .account{min-height:52px;padding:0 16px;gap:8px;font-size:14px;font-weight:850;line-height:1;color:#334155}
.panel.menu>.account{min-height:84px;padding-top:18px;padding-bottom:18px}
.panel.menu .link>span:not(.ms):not(.chev),.panel.menu .account strong{font-size:14px;font-weight:850;line-height:1;color:inherit}
.panel.menu .account small{font-size:12px;font-weight:700;line-height:1.2;margin-top:4px;color:#94a3b8}
.panel.menu .ms{font-family:'Material Symbols Rounded';font-size:19px;line-height:1;width:20px;flex:0 0 20px;display:inline-flex;align-items:center;justify-content:center}
.panel.menu .jiyue-icon{width:20px;height:20px;flex:0 0 20px}
.panel.menu .chev{font-size:20px;font-weight:700;color:#94a3b8}
.head{height:44px;display:grid;grid-template-columns:72px 1fr 72px;align-items:center;margin-bottom:14px}
.back{border:0;background:transparent;color:#7C3AED;font-size:14px;font-weight:600;text-align:left;line-height:1;padding:0;cursor:pointer}
.title{text-align:center;font-size:14px;font-weight:900;color:#101335}
.section{padding:20px}
.section h3{font-size:13px;font-weight:850;line-height:1.2}
.field{margin-bottom:16px}
.field:last-child{margin-bottom:0}
.field label{display:block;color:#445066;font-size:13px;font-weight:850;margin-bottom:7px}
.field input,.field select{width:100%;height:42px;border:1px solid #dde2eb;border-radius:15px;background:#f8fafc;color:#101335;font-size:13px;font-weight:850;padding:0 13px;box-sizing:border-box;outline:0}
.aip-profile-select{position:relative;width:100%}
.aip-profile-select-trigger{width:100%;height:42px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid rgba(17,20,59,.1);border-radius:14px;background:#f8fafc;padding:0 11px 0 12px;color:#11143b;font-size:13px;font-weight:800;text-align:left;outline:none}
.aip-profile-select-trigger.placeholder{color:#8b93a7}
.aip-profile-select-trigger .ms{font-family:'Material Symbols Rounded';font-size:20px;font-weight:400;color:#64748b;transition:transform .16s ease}
.aip-profile-select.open .aip-profile-select-trigger{border-color:rgba(124,77,255,.62);background:#fff;box-shadow:0 0 0 3px rgba(124,77,255,.08)}
.aip-profile-select.open .aip-profile-select-trigger .ms{transform:rotate(180deg);color:#6c27d6}
.aip-profile-select-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;max-height:218px;overflow:auto;border:1px solid rgba(124,77,255,.16);border-radius:16px;background:rgba(255,255,255,.98);box-shadow:0 18px 34px rgba(31,20,71,.14);padding:6px;scrollbar-width:none}
.aip-profile-select-menu::-webkit-scrollbar{display:none}
.aip-profile-select-option{width:100%;min-height:38px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:0;border-radius:12px;background:transparent;padding:0 10px;color:#11143b;font-size:13px;font-weight:800;text-align:left}
.aip-profile-select-option.on{background:#efe8ff;color:#6c27d6}
.aip-profile-select-option .ms{font-family:'Material Symbols Rounded';font-size:18px;font-weight:400}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{border:1px solid #dde2eb;background:#f4f6fb;color:#64748b;border-radius:999px;min-height:31px;padding:0 13px;font-size:13px;font-weight:850}
.chip.on{border-color:#7c3aed;color:#6c27d6;background:#f4efff}
.btnrow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.btn{height:44px;border:0;border-radius:15px;font-size:13px;font-weight:900}
.btn.secondary{background:#eef2ff;color:#6c27d6}
.btn.primary{background:linear-gradient(135deg,#6c27d6 0%,#7f37ea 100%);color:#fff}
.danger{display:block;width:100%;border:0;background:transparent;color:#ff4057;font-size:14px;font-weight:900;margin:54px auto 0}
.panel.children .danger{margin-bottom:0}
.settings-danger{height:44px;display:flex;align-items:center;justify-content:center;margin:auto 0 0;cursor:pointer;flex:0 0 auto}
.settings-delete-block{margin-top:auto;display:flex;flex-direction:column;gap:10px}
.settings-delete-confirm{border:1px solid rgba(255,64,87,.18);background:#fff;border-radius:16px;padding:14px;color:#445066;font-size:12px;font-weight:800;line-height:1.5}
.settings-delete-confirm strong{display:block;color:#ff4057;font-size:13px;margin-bottom:8px}
.settings-delete-confirm input{width:100%;height:38px;border:1px solid #dde2eb;border-radius:12px;background:#f8fafc;color:#101335;font-size:13px;font-weight:850;padding:0 12px;box-sizing:border-box;outline:0;margin-top:10px}
.settings-delete-confirm input:focus{border-color:rgba(255,64,87,.45);background:#fff}
.settings-delete-confirm .err{min-height:18px;color:#ff4057;margin-top:8px}
.tabs{display:flex;align-items:center;gap:8px;overflow-x:auto;overflow-y:hidden;padding:2px 0 18px;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{border:1px solid #dde2eb;border-radius:999px;background:#fff;color:#101335;font-size:12px;font-weight:850;min-height:34px;padding:0 11px;display:flex;align-items:center;gap:7px;white-space:nowrap;transition:all .2s;flex:0 0 auto;max-width:132px;min-width:0}
.tab.on{border-color:rgba(94,23,235,.3);background:rgba(94,23,235,.1);color:#5e17eb;box-shadow:0 0 0 2px rgba(94,23,235,.15)}
.tab img{width:24px;height:24px;border-radius:999px}
.tab span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.add{position:relative;width:32px;height:32px;border-radius:999px;border:1px solid #dde2eb;background:#fff;color:#101335;display:flex;align-items:center;justify-content:center;padding:0;flex:0 0 32px}
.add span{position:relative;display:block;width:13px;height:13px;flex:0 0 13px}
.add span::before,.add span::after{content:"";position:absolute;left:50%;top:50%;background:currentColor;border-radius:999px;transform:translate(-50%,-50%)}
.add span::before{width:13px;height:2px}
.add span::after{width:2px;height:13px}
.add:disabled{opacity:.45;cursor:not-allowed}
.insight{border:1px solid #ded6ff;background:#f4f6ff;border-radius:22px;padding:16px 18px;margin-bottom:20px}
.insight strong{font-size:13px;color:#101335}
.insight small{float:right;color:#7c3aed;font-weight:900;font-size:12px}
.insight p{margin:9px 0 0;color:#69728a;font-size:13px;font-weight:700;line-height:1.5}
.msg{text-align:center;color:#6c27d6;font-weight:900;min-height:24px;margin-top:10px}
.setting{min-height:58px;padding:0 18px;display:flex;align-items:center;border-bottom:1px solid rgba(15,23,42,.06);font-size:14px;font-weight:850;color:#101335}
.setting .value{margin-left:auto;color:#8b96ad}
.seg{display:flex;gap:10px;margin-left:auto}
.seg button{border:0;background:#f2f4f8;color:#9aa3b7;border-radius:999px;min-width:44px;height:32px;font-size:14px;font-weight:900}
.seg .on{border:1px solid #7c3aed;background:#f5efff;color:#6c27d6}
.memory-page{background:#edf1f6}
.memory-card{min-height:68px;padding:0 18px;display:flex;align-items:center;gap:12px}
.memory-card .ms{width:24px;flex:0 0 24px;color:#101335;font-size:22px}
.memory-title{font-size:15px;font-weight:900;color:#101335}
.memory-sub{padding:10px 18px 18px;color:#9aa3b8;font-size:13px;font-weight:750;line-height:1.55;border-top:1px solid rgba(15,23,42,.06)}
.memory-sub p{margin:0 0 8px}.memory-sub p:last-child{margin-bottom:0}
.memory-switch{margin-left:auto;width:58px;height:34px;border:0;border-radius:999px;background:#dbe1ec;padding:3px;display:flex;justify-content:flex-start;transition:all .16s;cursor:pointer}
.memory-switch.on{background:linear-gradient(135deg,#6c27d6 0%,#635bff 100%);justify-content:flex-end}
.memory-switch span{width:28px;height:28px;border-radius:999px;background:#fff;box-shadow:0 3px 8px rgba(15,23,42,.18)}
.memory-manage-row{cursor:pointer;border-top:1px solid rgba(15,23,42,.06)}
.memory-search{height:48px;border-radius:999px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 14px;margin:0 0 14px}
.memory-search .ms{color:#a6aec1;font-size:22px}
.memory-search input{flex:1;border:0;outline:0;background:transparent;color:#101335;font-size:14px;font-weight:800}
.memory-search input::placeholder{color:#a6aec1}
.memory-search button{border:0;border-left:1px solid rgba(15,23,42,.1);background:transparent;color:#101335;font-size:14px;font-weight:900;padding-left:14px}
.memory-list-card{background:#fff;border-radius:22px;padding:16px;margin-bottom:12px}
.memory-item{position:relative;background:#f7f8fc;border-radius:18px;padding:14px 38px 14px 14px;color:#101335;font-size:14px;font-weight:750;line-height:1.55;margin-bottom:10px}
.memory-item:last-child{margin-bottom:0}
.memory-item button{position:absolute;right:8px;top:8px;width:28px;height:28px;border:0;border-radius:999px;background:rgba(255,64,87,.08);color:#ff4057;font-family:'Material Symbols Rounded';font-size:18px}
.memory-empty{padding:48px 16px;text-align:center;color:#9aa3b8;font-size:13px;font-weight:800;line-height:1.6}
.profile-hero{padding:36px 22px 30px;text-align:center}
.profile-avatar-wrap{position:relative;width:118px;height:118px;margin:0 auto}
.profile-avatar{width:118px;height:118px;border-radius:999px;background:linear-gradient(135deg,#7c3aed,#ff2f8f);color:#fff;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:900;overflow:hidden}
.profile-edit{position:absolute;right:0;bottom:4px;width:42px;height:42px;border:0;border-radius:999px;background:rgba(16,19,53,.55);color:#fff;font-family:'Material Symbols Rounded';font-size:24px}
.profile-table{padding:0;border:1px solid rgba(15,23,42,.08)}
.profile-line{display:grid;grid-template-columns:150px 1fr;gap:18px;align-items:center;padding:22px 22px;border-bottom:1px solid rgba(15,23,42,.08)}
.profile-line:last-child{border-bottom:0}
.profile-line label{color:#101335;font-size:18px;font-weight:900}
.profile-line input{height:50px;border:1px solid #dde2eb;border-radius:16px;background:#fff;color:#101335;font-size:18px;font-weight:800;padding:0 16px;outline:0;min-width:0}
.profile-actions{display:flex;justify-content:flex-end;align-items:center;gap:18px;margin-top:22px}
.profile-cancel{height:48px;border:0;background:transparent;color:#8b8f9d;font-size:18px;font-weight:850;padding:0 12px}
.profile-save{height:48px;min-width:118px;border:0;border-radius:16px;background:#e9edfb;color:#6c27d6;font-size:18px;font-weight:900}
.profile-avatar-preview{width:64px!important;height:64px!important;border-radius:10px!important;background:#fff!important;border:1px solid rgba(15,23,42,.06);box-shadow:0 1px 0 rgba(15,23,42,.04);flex:0 0 64px}
.profile-avatar-preview img{width:100%;height:100%;object-fit:contain;display:block}
.search-sheet{position:fixed;inset:56px 0 auto 0;background:#fff;padding:12px 16px;z-index:9200;border-bottom:1px solid rgba(15,23,42,.08)}
.search-sheet>div{display:flex;gap:10px}
.search-sheet input{flex:1;height:42px;border-radius:999px;border:1px solid #dde2eb;padding:0 14px;font-size:13px;font-weight:400}
.search-sheet button{height:42px;border:0;border-radius:999px;background:#5f20e9;color:#fff;font-size:12px;font-weight:400;padding:0 18px}
.mobile-tab{display:none}
@keyframes slide{from{transform:translateX(100%)}to{transform:translateX(0)}}
@media(max-width:768px){
  #tb{padding:0 20px}
  .tb-nav,.tb-right{display:none}
  .mobile-actions{display:flex}
  .panel{width:min(360px,88vw);padding:42px 18px 90px}
  .panel.menu{width:min(360px,88vw);padding:42px 18px 90px}
  body.xf-mobile-tab-enabled{--xf-mobile-tab-height:calc(64px + env(safe-area-inset-bottom));padding-bottom:var(--xf-mobile-tab-height)}
  body.xf-mobile-tab-enabled::after{content:"";position:fixed;left:0;right:0;bottom:0;height:var(--xf-mobile-tab-height);background:#fff;z-index:7999;pointer-events:none}
  .mobile-tab{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:0;right:0;bottom:0;z-index:8000;background:#fff;-webkit-backdrop-filter:none;backdrop-filter:none;border-top:1px solid rgba(15,23,42,.08);box-shadow:0 -8px 24px rgba(15,23,42,.08);padding:8px 10px calc(8px + env(safe-area-inset-bottom))}
  .mobile-tab a,.mobile-tab button{border:0;background:transparent;text-decoration:none;color:#64748b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:48px;border-radius:14px;font-size:11px;font-weight:800}
  .mobile-tab .on{background:#f0eaff;color:#6c27d6}
  .mobile-tab .ms{font-size:19px}
  .mobile-tab a img{width:22px;height:22px;object-fit:contain}
  .mobile-tab button{position:relative;overflow:visible;touch-action:manipulation}
  .mobile-tab button img{width:42px;height:42px;object-fit:contain;transition:transform .18s ease,filter .18s ease}
  .mobile-tab button.xw-pressing img{transform:scale(1.16);filter:drop-shadow(0 0 12px rgba(108,39,214,.4))}
  .mobile-tab button.xw-pressing::before{content:"";position:absolute;inset:2px;border-radius:999px;background:rgba(108,39,214,.12);animation:xwPressPulse .72s ease-out infinite;z-index:-1}
  @keyframes xwPressPulse{0%{transform:scale(.72);opacity:.75}100%{transform:scale(1.5);opacity:0}}
  .mobile-tab .emoji-icon{font-size:19px;line-height:1}
}
@media(max-width:520px){
  .panel{width:min(360px,88vw);padding-left:18px;padding-right:18px}
  .panel.menu{width:min(360px,88vw)}
  .profile-line{grid-template-columns:1fr;gap:10px}
}
@media(min-width:769px){.desktop-menu{display:none}}
`;

const GlobalPublicNav: React.FC<GlobalPublicNavProps> = (props) => {
  const { showSearch=true, showLogout=true, compactMobile=false, showProgramList=true, showExpertsEntry=true, showBooksEntry=true, showMaterialsEntry=true, showPlanningEntry=true, searchPlaceholder="搜索节目标题/简介", searchValue, onSearchChange, headless=false } = props;
  const { pathname } = useLocation(); const navigate = useNavigate(); const dispatch = useDispatch(); const { user, token } = useSelector((s:RootState)=>s.user);
  const [panel,setPanel] = useState<PanelMode>(null); const [desktopMenu,setDesktopMenu]=useState(false); const [searchOpen,setSearchOpen]=useState(false); const [innerSearch,setInnerSearch]=useState(""); const [font,setFont]=useState(()=>Number(localStorage.getItem("xf_font_scale")||1)); const [leader,setLeader]=useState(false); const [xiaowanziHomeActive,setXiaowanziHomeActive]=useState(false); const id=useRef(`nav-${Math.random().toString(36).slice(2)}`);
  const embeddedLayer = useXiaowanziEmbeddedLayer();
  const miniProgramWebView = isMiniProgramWebView();
  const activePrograms=pathname.startsWith("/programs"), activeExperts=pathname.startsWith("/experts"), activeBooks=pathname.startsWith("/books")||pathname.startsWith("/reading"), activePlanning=pathname.startsWith("/planning"), activeTopics=pathname.startsWith("/topics"), activeMaterials=pathname.startsWith("/materials"), activeWorthBuy=pathname.startsWith("/worthbuy");
  const value=typeof searchValue==="string"?searchValue:innerSearch;
  useEffect(()=>{const k="__xf_global_public_nav_owner__", w=window as any; const elect=()=>{if(!w[k])w[k]=id.current; setLeader(w[k]===id.current)}; elect(); const t=window.setInterval(elect,300); return()=>{clearInterval(t); if(w[k]===id.current) delete w[k];};},[]);
  useEffect(()=>{if(xiaowanziHomeActive){setDesktopMenu(false);setSearchOpen(false);return}setPanel(null);setDesktopMenu(false);setSearchOpen(false)},[pathname,xiaowanziHomeActive]);
  useEffect(()=>{const open=()=>{setDesktopMenu(false);setPanel("children");window.setTimeout(()=>document.dispatchEvent(new CustomEvent("xf-child-profile-create")),0)};document.addEventListener("xf-open-child-profile-create",open);return()=>document.removeEventListener("xf-open-child-profile-create",open)},[]);
  useEffect(()=>{const open=()=>{setDesktopMenu(false);setPanel("children")};document.addEventListener("xf-open-child-profile",open);return()=>document.removeEventListener("xf-open-child-profile",open)},[]);
  useEffect(()=>{document.body.classList.toggle("xf-mobile-tab-enabled",compactMobile&&!embeddedLayer&&!headless&&!miniProgramWebView); return()=>document.body.classList.remove("xf-mobile-tab-enabled")},[compactMobile,embeddedLayer,headless,miniProgramWebView]);
  useEffect(()=>{PUBLIC_NAV_IMAGE_ASSETS.forEach(preloadPublicNavImage);if(user?.avatar_image)preloadPublicNavImage(user.avatar_image)},[user?.avatar_image]);
  useEffect(()=>{const openMenu=()=>setPanel("menu");document.addEventListener("xf-open-public-menu",openMenu);return()=>document.removeEventListener("xf-open-public-menu",openMenu)},[]);
  useEffect(()=>{const closeMenu=()=>{setPanel(null);setDesktopMenu(false);setSearchOpen(false)};document.addEventListener("xf-close-public-menu",closeMenu);return()=>document.removeEventListener("xf-close-public-menu",closeMenu)},[]);
  useEffect(()=>{const onState=(event:Event)=>setXiaowanziHomeActive(Boolean((event as CustomEvent<{active?:boolean}>).detail?.active));document.addEventListener("xf-xiaowanzi-home-state",onState);return()=>document.removeEventListener("xf-xiaowanzi-home-state",onState)},[]);
  useEffect(()=>{document.documentElement.style.setProperty("--xf-user-font-scale",String(font)); localStorage.setItem("xf_font_scale",String(font));},[font]);
  const input=(v:string)=>{setInnerSearch(v); onSearchChange?.(v)}; const submit=(v:string)=>{const q=String(v||"").trim(), from=encodeURIComponent(`${pathname}${window.location.search||""}`); navigate(q?`/search?q=${encodeURIComponent(q)}&from=${from}`:`/search?from=${from}`)}; const doLogout=()=>{dispatch(logout()); window.location.href="/"};
  if(embeddedLayer&&!headless) return <style>{CSS}</style>;
  if(!leader&&!headless) return null;
  const navLinks=<>{showProgramList&&<NavLink to="/programs/list" active={activePrograms} icon="podcasts" label="节目列表"/>}{showExpertsEntry&&<NavLink to="/experts" active={activeExperts} icon="person" label="先疯智库"/>}{showBooksEntry&&<NavLink to="/reading" active={activeBooks} image="/assets/jiyue-logo.png" label="及阅"/>}{showMaterialsEntry&&<NavLink to="/materials" active={activeMaterials} icon="inventory_2" label="学习资料"/>}{showPlanningEntry&&<NavLink to="/planning" active={activePlanning} icon="route" label="教育规划"/>}<NavLink to="/topics" active={activeTopics} emoji="🙏🏻" label="请教一下"/><NavLink to="/worthbuy" active={activeWorthBuy} icon="verified" label="知物"/></>;
  const panelOverlay=panel&&<div className={`mask ${panel==="menu"?"desktop-menu":""} ${xiaowanziHomeActive?"xw-home-layer":""}`} onClick={()=>setPanel(null)}><div className={`panel ${panel==="menu"?"menu":""} ${panel==="children"?"children":""} ${panel==="settings"?"settings":""} ${panel==="memory"||panel==="memoryManage"?"memory-page":""}`} onClick={e=>e.stopPropagation()}>{panel==="menu"&&<MenuPanel navLinks={navLinks} setPanel={setPanel} xiaowanziHomeActive={xiaowanziHomeActive}/>} {panel==="profile"&&<ProfilePanel back={()=>setPanel("menu")} close={()=>setPanel(null)}/>} {panel==="children"&&<ChildPanel back={()=>setPanel("menu")} close={()=>setPanel(null)}/>} {panel==="memory"&&<MemoryPanel back={()=>setPanel("menu")} manage={()=>setPanel("memoryManage")}/>} {panel==="memoryManage"&&<MemoryManagePanel back={()=>setPanel("memory")}/>} {panel==="settings"&&<SettingsPanel back={()=>setPanel("menu")} font={font} setFont={setFont} logout={doLogout} showLogout={showLogout}/>}</div></div>;
  if(headless) return <><style>{CSS}</style>{panelOverlay}</>;
  return <><style>{CSS}</style><nav className="fixed top-0 z-50 w-full"><div id="tb"><Link className="tb-logo" to="/programs/list"><img src="/assets/logo.png" alt="家长先疯" loading="eager" decoding="sync"/></Link><div className="tb-nav">{navLinks}</div><div className="tb-right">{showSearch&&<SearchBox value={value} placeholder={searchPlaceholder} onInput={input} onSubmit={submit}/>} {user&&token?<><div style={{position:"relative"}}><button className="uc" onClick={()=>setDesktopMenu(v=>!v)}><Avatar user={user}/><span className="uc-name">{user.name||user.username||"用户"}</span></button>{desktopMenu&&<DesktopMenu open={(m)=>{setPanel(m);setDesktopMenu(false)}}/>}</div>{showLogout&&<button className="ibtn" title="退出" type="button" onClick={doLogout}>logout</button>}</>:<button className="uc" onClick={()=>document.dispatchEvent(new CustomEvent("xf-show-login-modal"))}><LoggedOutAvatar/><span className="uc-name">登录/注册</span></button>}</div>{compactMobile&&<div className="mobile-actions">{showSearch&&pathname!=="/planning"&&<button className="mobile-search" onClick={()=>setSearchOpen(v=>!v)}>search</button>}<button className="mobile-toggle" onClick={()=>setPanel("menu")}>menu</button></div>}</div>{searchOpen&&<div className="search-sheet"><div><input value={value} placeholder={searchPlaceholder} onChange={e=>input(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submit(e.currentTarget.value)}}/><button onClick={()=>submit(value)}>搜索</button></div></div>}</nav>{compactMobile&&!miniProgramWebView&&<MobileTab/>}{panelOverlay}</>;
};
function NavLink({to,active,icon,image,emoji,label}:{to:string;active:boolean;icon?:string;image?:string;emoji?:string;label:string}){return <Link to={to} className={`tb-nav-btn ${active?"on":""}`}>{icon&&<span className="material-symbols-outlined ms">{icon}</span>}{image&&<img className="jiyue-icon" src={image} alt={label} loading="eager" decoding="sync"/>}{emoji&&<span>{emoji}</span>}<span>{label}</span></Link>}
function Avatar({user}:{user:any}){const src=user?.avatar_image||DEFAULT_CHILD_AVATAR;return <span className="uc-av has-image"><img src={src} alt={user?.name||user?.username||"用户"} loading="eager" decoding="sync" onError={(e)=>{e.currentTarget.src=DEFAULT_CHILD_AVATAR}}/></span>}
function LoggedOutAvatar(){return <span className="uc-av has-image"><img src={LOGGED_OUT_XIAOWANZI_AVATAR} alt="" aria-hidden="true" loading="eager" decoding="sync"/></span>}
function SearchBox({value,placeholder,onInput,onSubmit}:{value:string;placeholder:string;onInput:(v:string)=>void;onSubmit:(v:string)=>void}){return <label className="search-wrap"><span className="material-symbols-outlined ms">search</span><input value={value} placeholder={placeholder} onChange={e=>onInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")onSubmit(e.currentTarget.value)}}/></label>}
function DesktopMenu({open}:{open:(m:PanelMode)=>void}){return <div className="desktop-account-menu"><button className="link" onClick={()=>open("profile")}><span className="material-symbols-outlined ms">person</span><span>个人资料</span><span className="chev">›</span></button>{isProBillingEnabled()?<Link className="link" to="/pro"><span className="material-symbols-outlined ms">workspace_premium</span><span>订阅计划</span><span className="chev">›</span></Link>:null}<button className="link" onClick={()=>open("children")}><span className="material-symbols-outlined ms">badge</span><span>档案管理</span><span className="chev">›</span></button><button className="link" onClick={()=>open("memory")}><span className="material-symbols-outlined ms">psychology</span><span>记忆</span><span className="chev">›</span></button><button className="link" onClick={()=>open("settings")}><span className="material-symbols-outlined ms">settings</span><span>设置</span><span className="chev">›</span></button></div>}
function MenuItem({ to, icon, image, emoji, label, active, superMode, onOpenLayer, directSuperModeUrl }: { to: string; icon?: string; image?: string; emoji?: string; label: string; active?: boolean; superMode?: boolean; onOpenLayer?: () => void; directSuperModeUrl?: string }) {
  return <Link className={`link ${active ? "on" : ""}`} to={superMode && directSuperModeUrl ? directSuperModeUrl : to} onClick={(event)=>{if(!superMode)return;if(directSuperModeUrl){event.preventDefault();onOpenLayer?.();window.location.href=directSuperModeUrl;return;}event.preventDefault();onOpenLayer?.();window.setTimeout(()=>document.dispatchEvent(new CustomEvent("xf-xiaowanzi-browse-layer",{detail:{active:true,path:to,label}})),0)}}>{icon && <span className="material-symbols-outlined ms">{icon}</span>}{image && <img className="jiyue-icon" src={image} alt={label} loading="eager" decoding="sync" />}{emoji && <span>{emoji}</span>}<span>{label}</span><span className="chev">›</span></Link>;
}
function MenuPanel({setPanel,xiaowanziHomeActive}:{navLinks:React.ReactNode;setPanel:(m:PanelMode)=>void;xiaowanziHomeActive?:boolean}){
  const {user,token}=useSelector((s:RootState)=>s.user);
  const {pathname}=useLocation();
  const isAuthed=!!user&&!!token;
  const openLogin=()=>{setPanel(null);window.setTimeout(()=>document.dispatchEvent(new CustomEvent("xf-show-login-modal",{detail:{title:"登录/注册后继续",description:"登录后可同步个人资料、孩子档案和个性化推荐。"}})),0)};
  const openLayer=()=>setPanel(null);
  const itemProps={superMode:xiaowanziHomeActive,onOpenLayer:openLayer};
  return <>
    {isAuthed?<>
      <button className="account" onClick={()=>setPanel("profile")}><Avatar user={user}/><span><strong>{user?.name||user?.username||"用户"}</strong><small>查看和编辑个人资料</small></span><span className="chev">›</span></button>
      <div className="card">
        {isProBillingEnabled()?<MenuItem {...itemProps} to="/pro" icon="workspace_premium" label="订阅计划" active={pathname.startsWith("/pro")}/>:null}
        <button className="link" onClick={()=>setPanel("children")}><span className="material-symbols-outlined ms">badge</span><span>档案管理</span><span className="chev">›</span></button>
      </div>
    </>:<>
      <button className="account" onClick={openLogin}><LoggedOutAvatar/><span><strong>登录/注册</strong><small>登录后同步档案和个性化推荐</small></span><span className="chev">›</span></button>
      <div className="card">
        {isProBillingEnabled()?<MenuItem {...itemProps} to="/pro" icon="workspace_premium" label="订阅计划" active={pathname.startsWith("/pro")}/>:null}
        <button className="link" onClick={openLogin}><span className="material-symbols-outlined ms">badge</span><span>档案管理</span><span className="chev">›</span></button>
      </div>
    </>}
    <div className="card"><MenuItem {...itemProps} to="/programs/list" icon="podcasts" label="播客节目" active={pathname.startsWith("/programs")}/><MenuItem {...itemProps} to="/experts" directSuperModeUrl="/experts?xw_layer=1&xw_return=xiaowanzi" icon="person" label="先疯智库" active={pathname.startsWith("/experts")}/></div>
    <div className="card"><MenuItem {...itemProps} to="/reading" image="/assets/jiyue-logo.png" label="及阅" active={pathname.startsWith("/reading")||pathname.startsWith("/books")}/><MenuItem {...itemProps} to="/materials" icon="inventory_2" label="学习资料" active={pathname.startsWith("/materials")}/><MenuItem {...itemProps} to="/planning" icon="route" label="教育规划" active={pathname.startsWith("/planning")}/></div>
    <div className="card"><MenuItem {...itemProps} to="/topics" emoji="🙏🏻" label="请教一下" active={pathname.startsWith("/topics")}/><MenuItem {...itemProps} to="/worthbuy" icon="verified" label="知物" active={pathname.startsWith("/worthbuy")}/></div>
    <div className="card"><button className="link" onClick={()=>isAuthed?setPanel("memory"):openLogin()}><span className="material-symbols-outlined ms">psychology</span><span>记忆</span><span className="chev">›</span></button></div>
    <div className="card"><button className="link" onClick={()=>setPanel("settings")}><span className="material-symbols-outlined ms">settings</span><span>设置</span><span className="chev">›</span></button></div>
  </>;
}
function Header({title,back}:{title:string;back:()=>void}){return <div className="head"><button className="back" onClick={back}>← 返回</button><div className="title">{title}</div><span/></div>}
function ProfilePanel({back,close}:{back:()=>void;close:()=>void}){
  const dispatch=useDispatch();
  const {user,token}=useSelector((s:RootState)=>s.user);
  const initialAvatar=(user as any)?.avatar_image||"";
  const [name,setName]=useState(user?.name||user?.username||"");
  const [gender,setGender]=useState((user as any)?.gender||"");
  const [avatar,setAvatar]=useState(initialAvatar);
  const [msg,setMsg]=useState("");
  const [saving,setSaving]=useState(false);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const pickAvatar=(event:React.ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(!file)return;if(!new RegExp("^image/(jpeg|png|webp)$").test(file.type)){setMsg("请选择 JPG / PNG / WEBP 图片");event.target.value="";return}const reader=new FileReader();reader.onload=async()=>{const raw=String(reader.result||"");setAvatar(await normalizeAvatarDataUrl(raw));setMsg("")};reader.onerror=()=>setMsg("头像读取失败，请重试");reader.readAsDataURL(file)};
  const save=async()=>{
    const cleanName=name.trim();
    if(!token)return setMsg("请先登录");
    if(!cleanName)return setMsg("昵称不能为空");
    setSaving(true);
    setMsg("");
    try{
      const body:any={name:cleanName,gender:gender.trim(),avatar_initial:cleanName[0]||"探"};
      if(avatar!==initialAvatar)body.avatar_image=avatar;
      const r=await fetch("/api/users/me",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data?.message||data?.error||"保存失败");
      const nextUser={username:cleanName,name:cleanName,gender:gender.trim(),avatar_initial:cleanName[0]||"探",avatar_image:data?.avatar_image??avatar};
      dispatch(updateUser(nextUser));
      const stored=JSON.parse(localStorage.getItem("user")||"{}");
      localStorage.setItem("user",JSON.stringify({...stored,...nextUser}));
      close();
    }catch(e:any){setMsg(e?.message||"保存失败")}finally{setSaving(false)}
  };
  return <><Header title="个人资料" back={back}/><div className="card"><div className="section" style={{display:"flex",gap:16,alignItems:"center"}}><span className={`uc-av profile-avatar-preview ${avatar?"has-image":""}`}>{avatar?<img src={avatar} alt={name||"头像"} onError={(e)=>{e.currentTarget.style.display="none"; e.currentTarget.parentElement!.textContent=name[0]||"探"}}/>:name[0]||"探"}</span><div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{display:"none"}} onChange={pickAvatar}/><div className="chips"><button className="chip" type="button" onClick={()=>fileRef.current?.click()}>上传头像</button><button className="chip" type="button" onClick={()=>{setAvatar("");if(fileRef.current)fileRef.current.value=""}}>移除头像</button></div><small style={{color:"#98a1b5",fontWeight:700}}>支持 JPG / PNG / WEBP，建议 1:1 方图</small></div></div></div><div className="card"><div className="section"><div className="field"><label>昵称</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="请输入昵称"/></div><div className="field"><label>性别</label><div className="chips">{USER_GENDER_OPTIONS.map(x=><button key={x} className={`chip ${gender===x?"on":""}`} onClick={()=>setGender(gender===x?"":x)}>{x}</button>)}</div></div></div></div><button className="btn secondary" style={{width:"100%"}} onClick={save} disabled={saving}>{saving?"保存中...":"保存资料"}</button><div className="msg">{msg}</div></>}
function ChildPanel({back,close}:{back:()=>void;close:()=>void}){
  const [items,setItems]=useState(()=>loadChildren());
  const [activeId,setActiveId]=useState(localStorage.getItem(LAST_CHILD_ID_KEY)||"");
  const active=items.find(x=>x.id===activeId)||items[0]||null;
  const [draft,setDraft]=useState<ChildProfileLite>(active||emptyChild());
  const parsed=parseGrade(draft.grade);
  const [stage,setStage]=useState<ChildStage>(parsed.stage);
  const [gradeName,setGradeName]=useState(parsed.gradeName);
  const [msg,setMsg]=useState("");
  const hasDraftProfile=items.some(x=>x.draft);
  const add=()=>{const existingDraft=items.find(x=>x.draft);if(existingDraft){const pg=parseGrade(existingDraft.grade);localStorage.setItem(LAST_CHILD_ID_KEY,existingDraft.id);setActiveId(existingDraft.id);setDraft(existingDraft);setStage(pg.stage);setGradeName(pg.gradeName);setMsg("请先完善当前未命名档案");return}const n={...emptyChild(),draft:true};const next=[...items,n];const pg=parseGrade(n.grade);setItems(next);saveChildren(next);notifyChildrenUpdated();localStorage.setItem(LAST_CHILD_ID_KEY,n.id);setActiveId(n.id);setDraft(n);setStage(pg.stage);setGradeName(pg.gradeName);setMsg("")};
  useEffect(()=>{const n=items.find(x=>x.id===activeId)||(!activeId?items[0]:null);if(n){setDraft(n);const pg=parseGrade(n.grade);setStage(pg.stage);setGradeName(pg.gradeName)}},[activeId,items]);
  useEffect(()=>{const onCreate=()=>add();document.addEventListener("xf-child-profile-create",onCreate);return()=>document.removeEventListener("xf-child-profile-create",onCreate)},[items]);
  const districts=Object.entries(DISTRICTS_BY_CITY).find(([c])=>draft.city?.includes(c)||c.includes(draft.city||""))?.[1]||[];
  const gradeOptions=gradesFor(stage,draft.city||"");
  const setField=(patch:Partial<ChildProfileLite>)=>{setMsg("");setDraft(prev=>({...prev,...patch}))};
  const save=()=>{const item={...draft,displayName:draft.displayName.trim(),grade:formatGrade(stage,gradeName),gender:(draft.relation==="女儿"?"女":"男") as "男" | "女",draft:false};if(!childComplete(item))return setMsg("请先补全称呼、生日和年级再保存");const next=items.some(x=>x.id===item.id)?items.map(x=>x.id===item.id?item:x):[...items,item];setItems(next);saveChildren(next);notifyChildrenUpdated();localStorage.setItem(LAST_CHILD_ID_KEY,item.id);setActiveId(item.id);setDraft(item);setMsg("档案已保存")};
  const bind=()=>{const item={...draft,displayName:draft.displayName.trim(),grade:formatGrade(stage,gradeName),gender:(draft.relation==="女儿"?"女":"男") as "男" | "女"};const saved=items.some(x=>x.id===item.id);if(!saved&&!childComplete(item))return setMsg("请先补全称呼、生日和年级");if(childComplete(item))save();localStorage.setItem(CHAT_CONTEXT_KEY,JSON.stringify({childId:item.id,childName:item.displayName||"孩子",childGrade:item.grade,source:"nav-profile"}));document.dispatchEvent(new CustomEvent("xf-open-xiaowanzi",{detail:{childProfileId:item.id,childId:item.id}}));close()};
  const remove=()=>{const next=items.filter(x=>x.id!==draft.id);const deletions=mergeChildProfileDeletions(loadChildProfileDeletions(),[{id:draft.id,removedAt:new Date().toISOString()}]);saveChildProfileDeletions(deletions);saveChildren(next);notifyChildrenUpdated();setItems(next);const n=next[0]||emptyChild();const nextActiveId=next[0]?.id||"";const pg=parseGrade(n.grade);setDraft(n);setActiveId(nextActiveId);if(nextActiveId)localStorage.setItem(LAST_CHILD_ID_KEY,nextActiveId);else localStorage.removeItem(LAST_CHILD_ID_KEY);setStage(pg.stage);setGradeName(pg.gradeName);setMsg("档案已删除")};
  const updateCity=(city:string)=>{const nextGrades=gradesFor(stage,city);setField({city,region:""});if(!nextGrades.includes(gradeName))setGradeName(nextGrades[0])};
  const updateStage=(value:string)=>{setMsg("");const nextStage=value as ChildStage;setStage(nextStage);setGradeName(gradesFor(nextStage,draft.city||"")[0])};
  return <><Header title="档案管理" back={back}/><div className="tabs">{items.map(x=><button key={x.id} className={`tab ${draft.id===x.id?"on":""}`} onClick={()=>{setMsg("");setActiveId(x.id)}}><img src={DEFAULT_CHILD_AVATAR} loading="eager" decoding="sync"/><span>{x.displayName||"未命名"}</span></button>)}<button className="add" type="button" aria-label="添加孩子档案" onClick={add} disabled={hasDraftProfile}><span aria-hidden="true"/></button></div><div className="insight"><strong>今日洞察</strong><small>{formatGrade(stage,gradeName).replace(/^学前/,"")}</small><p>{draft.displayName||"孩子"}的档案会同步给小玩子，用于生成更贴合年龄、年级和关注点的建议。</p></div><div className="card"><div className="section"><h3 style={{margin:"0 0 14px",color:"#101335"}}>基本信息 <small style={{float:"right",color:"#7c3aed"}}>{childComplete({...draft,grade:formatGrade(stage,gradeName)})?"可绑定":"待补全"}</small></h3><div className="field"><label>称呼</label><input value={draft.displayName} onChange={e=>setField({displayName:e.target.value})} placeholder="例如 小圆子"/></div><div className="field"><label>关系</label><div className="chips">{CHILD_RELATIONS.map(x=><button key={x} className={`chip ${draft.relation===x?"on":""}`} onClick={()=>setField({relation:x,gender:x==="女儿"?"女":"男"})}>{x}</button>)}</div></div><div className="field"><label>出生日期</label><input type="date" value={draft.birthDate} onChange={e=>setField({birthDate:e.target.value})}/></div><div className="row"><div className="field"><label>城市</label><input value={draft.city||""} onChange={e=>updateCity(e.target.value)} placeholder="如：上海"/></div><div className="field"><label>区域</label>{districts.length?<ChildSelect id="nav-child-region" value={draft.region||""} placeholder="请选择区域" options={districts.map(x=>({value:x,label:x}))} onChange={value=>setField({region:value})}/>:<input value={draft.region||""} onChange={e=>setField({region:e.target.value})} placeholder={draft.city?"手动输入区域":"先填城市"}/>}</div></div><div className="row"><div className="field"><label>学段</label><ChildSelect id="nav-child-stage" value={stage} options={CHILD_STAGES.map(x=>({value:x,label:x}))} onChange={updateStage}/></div><div className="field"><label>年级</label><ChildSelect id="nav-child-grade" value={gradeName} options={gradeOptions.map(x=>({value:x,label:x}))} onChange={setGradeName}/></div></div><div className="field"><label>关注点（非必选）</label><div className="chips">{CHILD_TAGS.map(x=><button key={x} className={`chip ${draft.concernTags.includes(x)?"on":""}`} onClick={()=>setField({concernTags:draft.concernTags.includes(x)?draft.concernTags.filter(v=>v!==x):[...draft.concernTags,x]})}>{x}</button>)}</div></div><div className="btnrow"><button className="btn primary" onClick={save}>保存档案</button><button className="btn secondary" onClick={bind}>找小玩子</button></div></div></div><div className="msg">{msg}</div><button className="danger" onClick={remove}>删除</button></>;
}
function MemoryPanel({back,manage}:{back:()=>void;manage:()=>void}){
  const {token}=useSelector((s:RootState)=>s.user);
  const childId=currentMemoryChildId();
  const [enabled,setEnabled]=useState(true);
  const [msg,setMsg]=useState("");
  useEffect(()=>{let alive=true;if(!token)return;fetch(`/api/users/me/child-memories/${encodeURIComponent(childId)}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():{enabled:true}).then(data=>{if(alive)setEnabled(data?.enabled!==false)}).catch(()=>{if(alive)setEnabled(true)});return()=>{alive=false}},[token,childId]);
  const patch=async(patchBody:{enabled?:boolean})=>{setMsg("");try{if(!token)throw new Error("请先登录");const r=await fetch(`/api/users/me/child-memories/${encodeURIComponent(childId)}`,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(patchBody)});if(!r.ok)throw new Error("保存失败");const data=await r.json().catch(()=>({}));setEnabled(data?.enabled!==false);setMsg("设置已保存")}catch(e:any){setMsg(e?.message||"保存失败")}};
  return <><Header title="个性化回答" back={back}/><div className="card"><div className="memory-card"><div><div className="memory-title">开启记忆功能</div></div><button type="button" className={`memory-switch ${enabled?"on":""}`} onClick={()=>void patch({enabled:!enabled})} aria-pressed={enabled}><span/></button></div></div><div className="card"><button className="link memory-manage-row" type="button" onClick={manage}><span>管理记忆</span><span className="chev">›</span></button><div className="memory-sub"><p>小玩子会从与孩子相关的历史对话里记住重要信息。关闭记忆功能后，将不再读取或写入孩子记忆；你也可以随时通过“管理记忆”删除不希望小玩子记住的内容。</p><p>记忆写入策略不是“每隔多久汇总一次”，而是“每次小玩子完整回复后，满足条件就立刻合并一次记忆”。</p><p>具体规则：</p><p>触发时机：用户发问 → 小玩子回复完成 → 合并记忆。</p><p>记什么：会写入孩子档案，以及用户问题里被判断为“长期孩子事实”的内容，比如孩子性格、偏好、习惯、困难、最近状态、情绪、阅读、写作、数学、睡眠、社交等。</p><p>不记什么：页面浏览、路径、当前页面上下文、小玩子的回答内容都不会作为长期记忆保存。</p></div></div><div className="msg">{msg}</div></>;
}
function MemoryManagePanel({back}:{back:()=>void}){
  const {token}=useSelector((s:RootState)=>s.user);
  const childId=currentMemoryChildId();
  const [items,setItems]=useState<ChildMemoryItem[]>([]);
  const [query,setQuery]=useState("");
  const [msg,setMsg]=useState("");
  const load=()=>{if(!token)return;fetch(`/api/users/me/child-memories/${encodeURIComponent(childId)}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():{items:[]}).then(data=>setItems(Array.isArray(data?.items)?data.items:[])).catch(()=>setItems([]))};
  useEffect(()=>{load()},[token,childId]);
  const remove=async(id:string)=>{setMsg("");try{if(!token)throw new Error("请先登录");const r=await fetch(`/api/users/me/child-memories/${encodeURIComponent(childId)}/items/${encodeURIComponent(id)}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error("删除失败");const data=await r.json().catch(()=>({}));setItems(Array.isArray(data?.items)?data.items:[]);setMsg("记忆已删除")}catch(e:any){setMsg(e?.message||"删除失败")}};
  const filtered=items.filter(item=>item.text.includes(query.trim()));
  return <><Header title="我的记忆" back={back}/><div className="memory-search"><span className="material-symbols-outlined ms">search</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索记忆"/><button type="button">搜索</button></div><div className="memory-list-card">{filtered.length?filtered.map(item=><div className="memory-item" key={item.id}>{item.text}<button type="button" title="删除" onClick={()=>void remove(item.id)}>close</button></div>):<div className="memory-empty">暂无保存的孩子记忆。完成几次小玩子对话后，重要信息会整理到这里。</div>}</div><div className="msg">{msg}</div></>;
}
function SettingsPanel({back,font,setFont,logout,showLogout}:{back:()=>void;font:number;setFont:(v:number)=>void;logout:()=>void;showLogout:boolean}){
  const {user,token}=useSelector((s:RootState)=>s.user);
  const isAuthed=!!user&&!!token;
  const mobile=isAuthed?String((user as any)?.mobile||""):"";
  const masked=mobile.length>=7?`(+86) ${mobile.slice(0,3)}****${mobile.slice(-4)}`:"未绑定";
  const [deleteOpen,setDeleteOpen]=useState(false);
  const [deleteText,setDeleteText]=useState("");
  const [deleteMsg,setDeleteMsg]=useState("");
  const [deleting,setDeleting]=useState(false);
  const openLogin=()=>{back();window.setTimeout(()=>document.dispatchEvent(new CustomEvent("xf-show-login-modal",{detail:{title:"登录/注册后继续",description:"登录后可绑定手机、同步个人资料和个性化推荐。"}})),0)};
  const del=async()=>{
    if(!isAuthed)return openLogin();
    if(!deleteOpen){setDeleteOpen(true);setDeleteMsg("");return}
    const confirmation=deleteText.trim();
    if(confirmation!=="确认注销"){setDeleteMsg("请完整输入：确认注销");return}
    setDeleting(true);
    setDeleteMsg("");
    const r=token?await fetch("/api/users/me",{method:"DELETE",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({confirmation})}).catch(()=>null):null;
    if(!r){setDeleting(false);setDeleteMsg("注销请求失败，请稍后重试");return}
    if(!r.ok){const data=await r.json().catch(()=>({}));setDeleting(false);setDeleteMsg(data?.message||data?.error||"注销账号失败");return}
    logout();
  };
  return <><Header title="设置" back={back}/><div className="card"><div className="setting"><span>绑定手机</span><span className="value">{masked}</span></div><div className="setting"><span>字体大小</span><div className="seg"><button className={font===0.95?"on":""} onClick={()=>setFont(0.95)}>小</button><button className={font===1?"on":""} onClick={()=>setFont(1)}>标准</button><button className={font===1.1?"on":""} onClick={()=>setFont(1.1)}>大</button></div></div><div className="setting"><span>应用管理</span><span className="value">清理缓存 ›</span></div></div>{isAuthed&&showLogout?<button className="btn secondary" style={{width:"100%",marginTop:22,color:"#101335"}} onClick={logout}>退出登录</button>:!isAuthed?<button className="btn secondary" style={{width:"100%",marginTop:22,color:"#101335"}} onClick={openLogin}>登录/注册</button>:null}{isAuthed&&<div className="settings-delete-block">{deleteOpen&&<div className="settings-delete-confirm"><strong>确认注销账户</strong><div>注销后账号会进入 3 天恢复期，期间重新登录可恢复。继续请完整输入“确认注销”。</div><input value={deleteText} onChange={e=>setDeleteText(e.target.value)} placeholder="确认注销"/><div className="err">{deleteMsg}</div></div>}<button type="button" className="danger settings-danger" onPointerDown={e=>{e.preventDefault();e.stopPropagation();if(!deleting)void del()}} disabled={deleting}>{deleting?"注销中...":deleteOpen?"确认注销":"注销账户"}</button></div>}</>
}
function MobileTab({embeddedLayer=false}:{embeddedLayer?:boolean}){
  // DOM-level dedup: prevent duplicate bottom nav bars from leader election race
  const idRef = useRef(`xftab-${Math.random().toString(36).slice(2)}`);
  useEffect(()=>{
    const tabs = document.querySelectorAll('.mobile-tab');
    if(tabs.length > 1) {
      // Remove all but the last one (most recently mounted)
      for(let i=0; i<tabs.length-1; i++) tabs[i].remove();
    }
  });
  const {pathname}=useLocation();
  const [pressing,setPressing]=useState(false);
  const timerRef=useRef<number|null>(null);
  const pressHoldPulseRef=useRef<number|null>(null);
  const longPressedRef=useRef(false);
  const ap=pathname.startsWith("/programs"), ab=pathname.startsWith("/books")||pathname.startsWith("/reading"), am=pathname.startsWith("/materials"), at=pathname.startsWith("/topics");
  const clearPress=()=>{
    if(timerRef.current){
      window.clearTimeout(timerRef.current);
      timerRef.current=null;
    }
    if(pressHoldPulseRef.current){
      window.clearTimeout(pressHoldPulseRef.current);
      pressHoldPulseRef.current=null;
    }
    setPressing(false);
  };
  const openXiaowanzi=(mode:"chat"|"home")=>{
    if(embeddedLayer){
      window.parent?.postMessage({type:"xf-close-xiaowanzi-browse-layer"},"*");
      return;
    }
    document.dispatchEvent(new CustomEvent("xf-open-xiaowanzi",{detail:{source:"mobile-tab",mode}}));
  };
  const startPress=()=>{if(timerRef.current)return;longPressedRef.current=false;setPressing(true);timerRef.current=window.setTimeout(()=>{longPressedRef.current=true;openXiaowanzi("home");pressHoldPulseRef.current=window.setTimeout(()=>setPressing(false),220)},520)};
  const endPress=()=>clearPress();
  const onClick=()=>{if(longPressedRef.current){longPressedRef.current=false;return}openXiaowanzi("chat")};
  return <div id={idRef.current} className="mobile-tab"><Link className={ap?"on":""} to="/programs/list"><span className="material-symbols-outlined ms">podcasts</span><span>节目</span></Link><Link className={ab?"on":""} to="/reading"><img src="/assets/jiyue-logo.png" alt="" loading="eager" decoding="sync"/><span>及阅</span></Link><button className={pressing?"xw-pressing":""} onPointerDown={startPress} onPointerUp={endPress} onPointerCancel={endPress} onPointerLeave={endPress} onMouseDown={startPress} onMouseUp={endPress} onMouseLeave={endPress} onTouchStart={startPress} onTouchEnd={endPress} onClick={onClick} aria-label="小玩子，长按打开主页面"><img src={DEFAULT_CHILD_AVATAR} alt="" loading="eager" decoding="sync"/></button><Link className={am?"on":""} to="/materials"><span className="material-symbols-outlined ms">inventory_2</span><span>资料</span></Link><Link className={at?"on":""} to="/topics"><span className="emoji-icon">🙏🏻</span><span>请教</span></Link></div>
}
export default GlobalPublicNav;
