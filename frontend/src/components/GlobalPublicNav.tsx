import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../store";
import { logout, updateUser } from "../store/userSlice";

type GlobalPublicNavProps = {
  showSearch?: boolean;
  showAiOnline?: boolean;
  showLogout?: boolean;
  compactMobile?: boolean;
  showProgramList?: boolean;
  showProgramEntry?: boolean;
  showExpertsEntry?: boolean;
  showBooksEntry?: boolean;
  showMaterialsEntry?: boolean;
  showPlanningEntry?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
};

const GlobalPublicNav: React.FC<GlobalPublicNavProps> = ({
  showSearch = true,
  showAiOnline = true,
  showLogout = true,
  compactMobile = false,
  showProgramList = true,
  showProgramEntry = true,
  showExpertsEntry = true,
  showBooksEntry = true,
  showMaterialsEntry = true,
  showPlanningEntry = true,
  searchPlaceholder = "搜索节目标题/简介",
  searchValue,
  onSearchChange,
}) => {
  const { pathname } = useLocation();
  const activePrograms = pathname.startsWith("/programs");
  const activeExperts = pathname.startsWith("/experts");
  const activeBooks = pathname.startsWith("/books") || pathname.startsWith("/reading");
  const activePlanning = pathname.startsWith("/planning");
  const activeTopics = pathname.startsWith("/topics");
  const activeMaterials = pathname.startsWith("/materials");
  const activeWorthBuy = pathname.startsWith("/worthbuy");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const navInstanceIdRef = useRef(`nav-${Math.random().toString(36).slice(2)}`);

  // 登录态
  const dispatch = useDispatch();
  const { user: currentUser, token } = useSelector((state: RootState) => state.user);
  const isLoggedIn = !!currentUser && !!token;

  const handleLogout = () => {
    dispatch(logout());
    window.location.href = "/";
  };

  useEffect(() => {
    const ownerKey = "__xf_global_public_nav_owner__";
    const win = window as any;
    const myId = navInstanceIdRef.current;

    const elect = () => {
      if (!win[ownerKey]) {
        win[ownerKey] = myId;
      }
      setIsLeader(win[ownerKey] === myId);
    };

    elect();
    const timer = window.setInterval(elect, 300);

    return () => {
      window.clearInterval(timer);
      if (win[ownerKey] === myId) {
        delete win[ownerKey];
      }
    };
  }, []);

  if (!isLeader) return null;

  return (
    <>
      <style>{`
        #tb{height:52px;flex-shrink:0;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid rgba(17,10,8,.08);display:flex;align-items:center;z-index:100;padding:0 10px;gap:8px;overflow:visible}
        #tb .tb-logo{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 14px;cursor:pointer;transition:all .15s;height:calc(100% - 12px);border:1px solid transparent;border-radius:11px}
        #tb .tb-logo:hover{background:rgba(108,39,214,.05);border-color:rgba(108,39,214,.16)}
        #tb .tb-nav{flex:1;display:flex;align-items:center;padding:0 4px;gap:2px;height:100%;overflow:visible}
        #tb .tb-nav-btn{display:flex;align-items:center;gap:5px;height:100%;padding:0 12px;border:none;border-bottom:2px solid transparent;background:transparent;font:inherit;font-size:13px;font-weight:500;color:#6b7280;cursor:pointer;transition:all .15s;white-space:nowrap;position:relative;text-decoration:none}
        #tb .tb-nav-btn .ms{font-family:'Material Symbols Rounded';font-size:15px;line-height:1;font-variation-settings:'FILL' 0}
        #tb .tb-nav-btn:hover{color:#111118}
        #tb .tb-nav-btn.on{color:#6c27d6;font-weight:500;border-bottom-color:#6c27d6;text-shadow:0 0 .4px #6c27d6}
        #tb .tb-nav-btn.on .ms{font-variation-settings:'FILL' 1;color:#6c27d6}
        #tb .tb-right{display:flex;align-items:center;gap:4px;padding:0 8px;flex-shrink:0}
        #tb .search-wrap{display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:1px solid rgba(17,10,8,.12);border-radius:9999px;background:#fff;width:230px;min-width:230px}
        #tb .search-wrap input{width:100%;border:none;outline:none;background:transparent;font-size:12px;color:#111118}
        #tb .search-wrap input::placeholder{color:#9ca3af}
        #tb .search-divider{width:1px;height:24px;background:rgba(17,10,8,.08);margin:0 6px 0 2px}
        #tb .ai-pill{display:flex;align-items:center;gap:5px;padding:3px 9px;background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.18);border-radius:20px;font-size:10.5px;font-weight:600;color:#059669}
        #tb .ai-dot{width:5px;height:5px;border-radius:50%;background:#10b981;box-shadow:0 0 5px #10b981;animation:blink 2s ease-in-out infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
        #tb .uc{display:flex;align-items:center;gap:6px;padding:3px 10px 3px 5px;border:1px solid rgba(17,10,8,.08);border-radius:20px;cursor:pointer;transition:all .12s;text-decoration:none}
        #tb .uc:hover{border-color:#6c27d6;background:rgba(108,39,214,.09)}
        #tb .uc-av{width:20px;height:20px;border-radius:5px;background:linear-gradient(135deg,#6c27d6,#a855f7);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700}
        #tb .uc-name{font-size:11.5px;font-weight:600;color:#111118}
        #tb .ibtn{width:30px;height:30px;border:none;border-radius:7px;background:transparent;color:#6b7280;display:flex;align-items:center;justify-content:center;font-family:'Material Symbols Rounded';font-size:16px;font-variation-settings:'FILL' 0;transition:all .12s}
        #tb .mobile-toggle{display:none}
        #tb .mobile-main-link{display:none}
        .tb-mobile-panel{display:none}

        @media (max-width: 768px){
          #tb{height:56px;padding:0 8px}
          #tb .tb-logo{padding:0 8px;height:calc(100% - 10px)}
          #tb .tb-nav{display:none}
          #tb .tb-right{display:none}
          #tb .mobile-toggle{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid rgba(17,10,8,.12);background:#fff;border-radius:10px;color:#4b5563;font-family:'Material Symbols Rounded';font-size:20px;line-height:1}
          #tb .mobile-main-link{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 12px;border-radius:10px;border:1px solid rgba(17,10,8,.08);font-size:12px;font-weight:700;color:#374151;background:#fff;text-decoration:none}
          #tb .mobile-main-link.on{color:#6c27d6;border-color:rgba(108,39,214,.3);background:rgba(108,39,214,.06)}
          .tb-mobile-panel{display:block;position:fixed;top:56px;left:0;right:0;background:rgba(255,255,255,.98);backdrop-filter:blur(10px);border-bottom:1px solid rgba(17,10,8,.08);z-index:49;padding:10px 12px 14px;box-shadow:0 14px 30px rgba(30,41,59,.08)}
          .tb-mobile-grid{display:grid;gap:8px}
          .tb-mobile-link{min-height:44px;display:flex;align-items:center;gap:8px;padding:0 12px;border-radius:12px;border:1px solid rgba(148,163,184,.3);text-decoration:none;color:#334155;font-size:13px;font-weight:700;background:#fff}
          .tb-mobile-link.on{border-color:rgba(108,39,214,.35);background:rgba(108,39,214,.06);color:#6c27d6}
          .tb-mobile-muted{margin-top:8px;font-size:11px;color:#64748b;font-weight:600}
        }
      `}</style>
      <nav className="fixed top-0 z-50 w-full">
        <div id="tb">
          <Link className="tb-logo" to="/programs/list" onClick={() => setMenuOpen(false)}>
            <img src="/assets/logo.png" alt="Logo" style={{ height: 29 }} />
          </Link>

          <nav className="tb-nav" id="tb-nav">
            {showProgramList ? (
              <Link to="/programs/list" className={`tb-nav-btn ${activePrograms ? "on" : ""}`}>
                <span className="ms">podcasts</span>
                <span>节目列表</span>
              </Link>
            ) : null}
            {showExpertsEntry ? (
              <Link to="/experts" className={`tb-nav-btn ${activeExperts ? "on" : ""}`}>
                <span className="ms">person</span>
                <span>先疯智库</span>
              </Link>
            ) : null}
            {showBooksEntry ? (
              <Link to="/reading" className={`tb-nav-btn ${activeBooks ? "on" : ""}`}>
                <img src="/assets/jiyue-logo.png" alt="及阅" style={{ height: 18, width: 18, objectFit: 'contain' }} />
                <span>及阅</span>
              </Link>
            ) : null}
            {showMaterialsEntry ? (
              <Link to="/materials" className={`tb-nav-btn ${activeMaterials ? "on" : ""}`}>
                <span className="ms">inventory_2</span>
                <span>学习资料</span>
              </Link>
            ) : null}
            {showPlanningEntry ? (
              <>
                <Link to="/planning" className={`tb-nav-btn ${activePlanning ? "on" : ""}`}>
                  <span className="ms">route</span>
                  <span>教育规划</span>
                </Link>
                <Link to="/topics" className={`tb-nav-btn ${activeTopics ? "on" : ""}`}>
                  <span style={{ fontSize: "14px", lineHeight: 1, display: "inline-flex", alignItems: "center" }}>🙏🏻</span>
                  <span>请教一下</span>
                </Link>
                <Link to="/worthbuy" className={`tb-nav-btn ${activeWorthBuy ? "on" : ""}`}>
                  <span className="ms">verified</span>
                  <span>知物</span>
                </Link>
              </>
            ) : null}
          </nav>

          <div className="tb-right">
            {showSearch ? (
              <>
                <label
                  className="search-wrap"
                  id="tb-program-search-wrap"
                  onClick={() => { if (!isLoggedIn) { document.dispatchEvent(new CustomEvent('xf-show-login-modal', { detail: { title: '登录后可搜索', description: '登录后即可搜索节目内容、筛选标签、翻页浏览全部课程。' } })); } }}
                  style={!isLoggedIn ? { cursor: 'pointer' } : undefined}
                >
                  <span className="ms0" style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 16, color: "#9ca3af", lineHeight: 1 }}>
                    search
                  </span>
                  <input
                    id="tb-program-search-input"
                    type="text"
                    placeholder={isLoggedIn ? searchPlaceholder : '登录后可使用搜索'}
                    value={typeof searchValue === "string" ? searchValue : undefined}
                    onChange={(event) => onSearchChange?.(event.target.value)}
                    disabled={!isLoggedIn}
                    style={!isLoggedIn ? { pointerEvents: 'none' } : undefined}
                  />
                </label>
                {showAiOnline ? <span className="search-divider" id="tb-search-divider" /> : null}
              </>
            ) : null}
            {showAiOnline ? (
              <div className="ai-pill" id="ai-pill">
                <div className="ai-dot" />
                <span id="ai-txt">AI 在线</span>
              </div>
            ) : null}
            {isLoggedIn ? (
              <>
                <button
                  className="uc"
                  id="uc"
                  type="button"
                  onClick={() => {
                    const mask = document.getElementById('xf-profile-mask');
                    if (mask) mask.classList.remove('hidden');
                  }}
                  style={{ background: 'transparent', border: 'none', outline: 'none' }}
                >
                  <div
                    className="uc-av"
                    id="uc-av"
                    style={currentUser?.avatar_image
                      ? { background: `url(${currentUser.avatar_image}) center/cover`, backgroundSize: 'cover' }
                      : undefined}
                  >
                    {!currentUser?.avatar_image ? ((currentUser?.name || currentUser?.username || 'U')[0]) : null}
                  </div>
                  <span className="uc-name" id="uc-name">{currentUser?.name || currentUser?.username || '用户'}</span>
                </button>
                {showLogout ? (
                  <button className="ibtn" title="退出" type="button" onClick={handleLogout}>
                    logout
                  </button>
                ) : null}
              </>
            ) : (
              <button
                className="uc" id="uc"
                onClick={() => { document.dispatchEvent(new CustomEvent('xf-show-login-modal', { detail: { title: '登录后继续浏览', description: '登录后可解锁完整课程、查看详细内容，获得个性化成长推荐。' } })); }}
              >
                <div className="uc-av" id="uc-av">登</div>
                <span className="uc-name" id="uc-name">登录/注册</span>
              </button>
            )}
          </div>

          {compactMobile ? (
            <>
              {showProgramEntry ? (
                <Link to="/programs/list" className={`mobile-main-link ${activePrograms ? "on" : ""}`} onClick={() => setMenuOpen(false)}>
                  节目入口
                </Link>
              ) : null}
              <button type="button" className="mobile-toggle" onClick={() => setMenuOpen((v) => !v)} aria-label="打开导航菜单">
                menu
              </button>
            </>
          ) : null}
        </div>

        {compactMobile && menuOpen ? (
          <div className="tb-mobile-panel">
            <div className="tb-mobile-grid">
              <Link className={`tb-mobile-link ${activePrograms ? "on" : ""}`} to="/programs/list" onClick={() => setMenuOpen(false)}>
                <span className="ms">podcasts</span>
                <span>播客节目</span>
              </Link>
              {showExpertsEntry ? (
                <Link className={`tb-mobile-link ${activeExperts ? "on" : ""}`} to="/experts" onClick={() => setMenuOpen(false)}>
                  <span className="ms">person</span>
                  <span>先疯智库</span>
                </Link>
              ) : null}
              {showBooksEntry ? (
                <Link className={`tb-mobile-link ${activeBooks ? "on" : ""}`} to="/reading" onClick={() => setMenuOpen(false)}>
                  <img src="/assets/jiyue-logo.png" alt="及阅" style={{ height: 18, width: 18, objectFit: 'contain' }} />
                  <span>及阅</span>
                </Link>
              ) : null}
              {showMaterialsEntry ? (
                <Link className={`tb-mobile-link ${activeMaterials ? "on" : ""}`} to="/materials" onClick={() => setMenuOpen(false)}>
                  <span className="ms">inventory_2</span>
                  <span>学习资料</span>
                </Link>
              ) : null}
              {showPlanningEntry ? (
                <>
                  <Link className={`tb-mobile-link ${activePlanning ? "on" : ""}`} to="/planning" onClick={() => setMenuOpen(false)}>
                    <span className="ms">route</span>
                    <span>教育规划</span>
                  </Link>
                  <Link className={`tb-mobile-link ${activeTopics ? "on" : ""}`} to="/topics" onClick={() => setMenuOpen(false)}>
                    <span style={{ fontSize: "14px", lineHeight: 1, display: "inline-flex", alignItems: "center" }}>🙏🏻</span>
                    <span>请教一下</span>
                  </Link>
                  <Link className={`tb-mobile-link ${activeWorthBuy ? "on" : ""}`} to="/worthbuy" onClick={() => setMenuOpen(false)}>
                    <span className="ms">verified</span>
                    <span>知物</span>
                  </Link>
                </>
              ) : null}
              <button
                className="tb-mobile-link"
                onClick={() => { setMenuOpen(false); document.dispatchEvent(new CustomEvent('xf-show-login-modal', { detail: { title: '登录后继续浏览', description: '登录后可解锁完整课程、查看详细内容，获得个性化成长推荐。' } })); }}
              >
                <span className="ms">login</span>
                <span>登录/注册</span>
              </button>
            </div>
            <p className="tb-mobile-muted">面向家长的教育决策内容平台</p>
          </div>
        ) : null}
      </nav>
      <ProfileEditor />
    </>
  );
};

export default GlobalPublicNav;

// ── 个人资料编辑器（复刻 wel 样式，走 React PATCH /api/users/me）──
// ── 年级学段联动配置 ──
// 五四制城市（上海等）：小学 1-5 年级、初中 4 年（预初+7-9）
const WUSI_CITIES = ['上海','上海市','shanghai','威海','威海市','淄博','淄博市','莱芜','莱芜市','烟台','烟台市','哈尔滨','哈尔滨市','大庆','大庆市','青岛','青岛市'];
type Stage = '学前' | '小学' | '初中' | '高中';
const STAGES: Stage[] = ['学前', '小学', '初中', '高中'];
const GRADES_BY_STAGE: Record<Stage, string[]> = {
  '学前': ['未入园','托班','小班','中班','大班'],
  '小学': ['一年级','二年级','三年级','四年级','五年级','六年级'],
  '初中': ['六年级（预初）','七年级','八年级','九年级'],
  '高中': ['高一年级','高二年级','高三年级'],
};

// 城市 → 区域列表联动
const DISTRICTS_BY_CITY: Record<string, string[]> = {
  '上海': ['黄浦区','徐汇区','长宁区','静安区','普陀区','虹口区','杨浦区','闵行区','宝山区','嘉定区','浦东新区','金山区','松江区','青浦区','奉贤区','崇明区'],
  '北京': ['东城区','西城区','朝阳区','丰台区','石景山区','海淀区','顺义区','通州区','大兴区','房山区','门头沟区','昌平区','平谷区','密云区','怀柔区','延庆区'],
  '广州': ['越秀区','海珠区','荔湾区','天河区','白云区','黄埔区','南沙区','番禺区','花都区','增城区','从化区'],
  '深圳': ['福田区','罗湖区','南山区','盐田区','宝安区','龙岗区','龙华区','坪山区','光明区'],
  '杭州': ['上城区','拱墅区','西湖区','滨江区','余杭区','萧山区','临平区','钱塘区','富阳区','临安区'],
  '成都': ['锦江区','青羊区','金牛区','武侯区','成华区','龙泉驿区','青白江区','新都区','温江区','双流区','郫都区'],
  '武汉': ['江岸区','江汉区','硚口区','汉阳区','武昌区','青山区','洪山区','东西湖区'],
  '南京': ['玄武区','秦淮区','建邺区','鼓楼区','浦口区','栖霞区','雨花台区','江宁区','六合区'],
  '重庆': ['渝中区','江北区','沙坪坝区','九龙坡区','南岸区','北碚区','渝北区','巴南区'],
  '天津': ['和平区','河东区','河西区','南开区','河北区','红桥区','滨海新区'],
  '苏州': ['姑苏区','吴中区','相城区','吴江区','虎丘区'],
};

// 从完整年级字符串解析 stage + gradeName
function parseGrade(raw: string): { stage: Stage; gradeName: string } | null {
  if (!raw) return null;
  const t = raw.trim();
  for (const stage of STAGES) {
    const grades = GRADES_BY_STAGE[stage];
    for (const g of grades) {
      if (t.includes(g) || (stage === '高中' && t.includes(g.replace('年级','')))) {
        return { stage, gradeName: g };
      }
    }
  }
  // fallback: 模糊匹配
  if (t.includes('未入园')||t.includes('托班')||t.includes('小班')||t.includes('中班')||t.includes('大班')) return { stage:'学前', gradeName:'大班' };
  if (t.includes('小') || t.includes('年级') && (t.includes('一')||t.includes('二')||t.includes('三')||t.includes('四')||t.includes('五')||t.includes('六'))) return { stage:'小学', gradeName:'六年级' };
  if (t.includes('初') || t.includes('七')||t.includes('八')||t.includes('九')) return { stage:'初中', gradeName:'九年级' };
  if (t.includes('高')) return { stage:'高中', gradeName:'高三年级' };
  return null;
}

// 根据城市判断是否五四制，调整年级列表
function getGradesForStageAndCity(stage: Stage, city: string): string[] {
  const isWusi = WUSI_CITIES.some(c => city.includes(c));
  if (stage === '小学' && isWusi) {
    // 五四制：小学五年
    return ['一年级','二年级','三年级','四年级','五年级'];
  }
  if (stage === '初中' && isWusi) {
    // 五四制：初中四年（含预初）
    return ['六年级（预初）','七年级','八年级','九年级'];
  }
  return GRADES_BY_STAGE[stage];
}

const PROFILE_STYLES = `
.xf-pmask{position:fixed;inset:0;background:rgba(10,10,20,.45);backdrop-filter:blur(6px);z-index:9200;display:flex;align-items:center;justify-content:center}
.xf-pmask.hidden{display:none}
.xf-pcard{width:min(560px,92vw);background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:16px;box-shadow:0 16px 50px rgba(0,0,0,.2);overflow:hidden}
.xf-phd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(0,0,0,.07)}
.xf-pttl{font-size:14px;font-weight:700}
.xf-pbd{padding:14px 16px}
.xf-pava-top{display:flex;align-items:center;gap:12px;padding:4px 0 12px}
.xf-pava-preview{width:64px;height:64px;border-radius:16px;border:1px solid rgba(0,0,0,.07);background:linear-gradient(135deg,#6c27d6,#a855f7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:800;overflow:hidden;flex-shrink:0}
.xf-pava-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.xf-pava-btn{padding:7px 12px;border:1px solid rgba(0,0,0,.07);border-radius:999px;background:#fff;font-size:12px;font-weight:700;color:#6b7280;cursor:pointer;transition:all .12s}
.xf-pava-btn:hover{border-color:#6c27d6;color:#6c27d6;background:rgba(108,39,214,.09)}
.xf-pava-tip{font-size:10px;color:#9ca3af}
.xf-prow{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.xf-pfield{margin-bottom:10px}
.xf-pfield label{display:block;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.xf-pfield input,.xf-pfield select{width:100%;padding:9px 11px;border:1px solid rgba(0,0,0,.07);border-radius:9px;background:#fff;font-size:13px;outline:none;box-sizing:border-box}
.xf-pfield input:focus,.xf-pfield select:focus{border-color:#6c27d6}
.xf-pft{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid rgba(0,0,0,.07)}
.xf-pbtn{border:1px solid rgba(0,0,0,.07);background:#fff;color:#111118;padding:8px 13px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer}
.xf-pbtn.primary{background:#6c27d6;color:#fff;border-color:#6c27d6}
.xf-ibtn{width:30px;height:30px;border:none;border-radius:7px;background:transparent;color:#6b7280;display:flex;align-items:center;justify-content:center;font-family:'Material Symbols Rounded';font-size:16px;font-variation-settings:'FILL' 0;transition:all .12s;cursor:pointer;padding:0}
.xf-ibtn:hover{background:rgba(108,39,214,.09);color:#6c27d6}
`;

const ProfileEditor: React.FC = () => {
  const dispatch = useDispatch();
  const { user: currentUser, token } = useSelector((state: RootState) => state.user);
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>('初中');
  const [gradeName, setGradeName] = useState('九年级');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState(false);

  // 根据城市获取可用区域列表
  const districtOptions = (() => {
    if (!city) return [];
    for (const [key, list] of Object.entries(DISTRICTS_BY_CITY)) {
      if (city.includes(key) || key.includes(city)) return list;
    }
    return [];
  })();

  // 城市变更时重置区域
  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    setDistrict('');
  };

  // 根据学段+年级名拼出完整年级字符串
  const fullGrade = stage === '学前' ? `学前${gradeName}`
    : stage === '小学' ? `小学${gradeName}`
    : stage === '初中' ? `初中${gradeName.replace('（预初）','')}`
    : gradeName;

  useEffect(() => {
    if (!token || loaded) return;
    const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '';
    fetch(`${API_BASE_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => {
      setName(d.name || d.username || '');
      setCity(d.city || '');
      setDistrict(d.region || '');
      const parsed = parseGrade(d.grade || '');
      if (parsed) {
        setStage(parsed.stage);
        setGradeName(parsed.gradeName);
      }
      setAvatar(d.avatar_image || '');
      setLoaded(true);

      // 首次登录引导：标记需要弹出资料编辑
      if (sessionStorage.getItem("xf_show_profile") === "1") {
        sessionStorage.removeItem("xf_show_profile");
        setOnboardingMode(true);
        setTimeout(() => {
          document.getElementById('xf-profile-mask')?.classList.remove('hidden');
        }, 500);
      }
    }).catch(() => setLoaded(true));
  }, [token, loaded]);

  const close = () => {
    document.getElementById('xf-profile-mask')?.classList.add('hidden');
  };

  // 头像上传
  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) { setMsg('请先登录'); return; }
    if (file.size > 5 * 1024 * 1024) { setMsg('图片不能超过 5MB'); return; }
    setMsg('');
    const formData = new FormData();
    formData.append('image', file);
    try {
      const resp = await fetch(`/api/users/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) {
        setMsg(data?.message || data?.error || '上传失败');
        return;
      }
      if (data.url) {
        setAvatar(data.url);
        // 同时更新 localStorage
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        stored.avatar_image = data.url;
        localStorage.setItem('user', JSON.stringify(stored));
      }
    } catch (err: any) {
      setMsg(err?.message || '网络错误，请重试');
    }
  };

  const clearAvatar = () => setAvatar('');

  const handleSave = async () => {
    if (!token) return;
    if (!name.trim()) { setMsg('昵称不能为空'); return; }
    setSaving(true);
    setMsg('');
    try {
      const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '';
      const body: Record<string,string> = {
        name: name.trim(),
        city: city.trim(),
        region: district.trim(),
        grade: fullGrade,
        avatar_initial: name.trim()[0] || '探',
      };
      if (avatar) body.avatar_image = avatar;
      const resp = await fetch(`${API_BASE_URL}/api/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        dispatch(updateUser({
          username: name.trim(),
          name: name.trim(),
          city: city.trim(),
          region: district.trim(),
          grade: fullGrade,
          avatar_image: avatar || (currentUser as any)?.avatar_image || '',
          avatar_initial: name.trim()[0] || '探',
        }));
        close();
      } else {
        const err = await resp.json().catch(() => ({}));
        setMsg(err?.error || err?.message || '保存失败');
      }
    } catch (e: any) {
      setMsg(e?.message || '网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{PROFILE_STYLES}</style>
      <div className="xf-pmask hidden" id="xf-profile-mask" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="xf-pcard" onClick={e => e.stopPropagation()}>
          <div className="xf-phd">
            <div className="xf-pttl">完善个人资料</div>
            <button className="xf-ibtn" onClick={close}>close</button>
          </div>
          <div className="xf-pbd">
            <div className="xf-pava-top">
              <div className="xf-pava-preview" style={avatar ? { background: `url(${avatar}) center/cover` } : {}}>
                {!avatar ? (name[0] || '探') : null}
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <div className="xf-pava-actions">
                  <button className="xf-pava-btn" onClick={() => document.getElementById('xf-avatar-file')?.click()}>上传头像</button>
                  <button className="xf-pava-btn" onClick={clearAvatar}>移除头像</button>
                </div>
                <div className="xf-pava-tip">支持 JPG / PNG / WEBP，建议 1:1 方图</div>
              </div>
              <input id="xf-avatar-file" type="file" accept="image/*" style={{ display:'none' }} onChange={handleAvatarPick} />
            </div>
            {onboardingMode ? (
              <div style={{ marginBottom: 10, borderRadius: 12, border: "1px solid rgba(108,39,214,.16)", background: "rgba(108,39,214,.04)", padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#5b21b6", marginBottom: 4 }}>完成 1 分钟资料引导</div>
                <div style={{ fontSize: 12, color: "#7c3aed" }}>仅需昵称和城市，即可开启本地化教育推荐与成长路径建议。</div>
              </div>
            ) : null}
            <div className="xf-pfield" style={{ marginBottom: 10 }}><label>昵称</label><input value={name} onChange={e => setName(e.target.value)} placeholder="请输入昵称" /></div>
            {onboardingMode ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="xf-pfield"><label>城市</label><input value={city} onChange={e => handleCityChange(e.target.value)} placeholder="如：上海" /></div>
                <div className="xf-pfield"><label>区域（可选）</label>
                  {districtOptions.length > 0 ? (
                    <select value={district} onChange={e => setDistrict(e.target.value)}>
                      <option value="">请选择区域</option>
                      {districtOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : (
                    <input value={district} onChange={e => setDistrict(e.target.value)} placeholder={city ? '手动输入区域' : '先选城市'} />
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <div className="xf-pfield"><label>城市</label><input value={city} onChange={e => handleCityChange(e.target.value)} placeholder="如：上海" /></div>
                <div className="xf-pfield"><label>区域</label>
                  {districtOptions.length > 0 ? (
                    <select value={district} onChange={e => setDistrict(e.target.value)}>
                      <option value="">请选择区域</option>
                      {districtOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : (
                    <input value={district} onChange={e => setDistrict(e.target.value)} placeholder={city ? '手动输入区域' : '先选城市'} />
                  )}
                </div>
                <div className="xf-pfield"><label>学段</label><select value={stage} onChange={s => { setStage(s.target.value as Stage); const grades = getGradesForStageAndCity(s.target.value as Stage, city); setGradeName(grades[0]); }}>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select></div>
                <div className="xf-pfield"><label>年级</label><select value={gradeName} onChange={e => setGradeName(e.target.value)}>
                  {getGradesForStageAndCity(stage, city).map(g => <option key={g} value={g}>{g}</option>)}
                </select></div>
              </div>
            )}
            {msg && <div style={{ fontSize: 12, marginTop: 8, color: '#dc2626' }}>{msg}</div>}
          </div>
          <div className="xf-pft">
            <button className="xf-pbtn" onClick={close}>{onboardingMode ? "稍后完善" : "取消"}</button>
            <button className="xf-pbtn primary" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? '保存中…' : (onboardingMode ? "开启个性化推荐" : "保存资料")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
