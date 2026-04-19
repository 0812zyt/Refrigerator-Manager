import { useState, useRef, useEffect, useCallback } from "react";

const CATEGORIES = ["全部", "蔬菜", "水果", "肉類", "乳製品", "飲料", "調味料", "冷凍食品", "其他"];
const CATEGORY_ICONS = { 蔬菜:"🥬", 水果:"🍎", 肉類:"🥩", 乳製品:"🧀", 飲料:"🥤", 調味料:"🧂", 冷凍食品:"🧊", 其他:"📦" };
const DEMO_ITEMS = [
  { id:1, name:"牛奶",   category:"乳製品", quantity:"1 瓶",  expiry:"2026-04-16", note:"全脂" },
  { id:2, name:"雞蛋",   category:"乳製品", quantity:"10 顆", expiry:"2026-04-20", note:"" },
  { id:3, name:"花椰菜", category:"蔬菜",   quantity:"1 顆",  expiry:"2026-04-14", note:"" },
  { id:4, name:"蘋果汁", category:"飲料",   quantity:"2 罐",  expiry:"2026-05-01", note:"冷藏後更好喝" },
  { id:5, name:"豬里肌", category:"肉類",   quantity:"300g",  expiry:"2026-04-13", note:"已解凍" },
];

const getDaysLeft = (d) => { const t = new Date(); t.setHours(0,0,0,0); return Math.ceil((new Date(d)-t)/86400000); };

function ExpiryBadge({ days }) {
  if (days < 0)  return <span style={s.bExp}>已過期</span>;
  if (days === 0) return <span style={s.bToday}>今天到期</span>;
  if (days <= 2)  return <span style={s.bWarn}>{days}天後到期</span>;
  if (days <= 7)  return <span style={s.bSoon}>{days}天後到期</span>;
  return <span style={s.bOk}>{days}天後到期</span>;
}

// ── 新增方式選擇 Modal ────────────────────────────────────────────
function AddChoiceModal({ onManual, onCamera, onClose }) {
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 360, textAlign:"center" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ ...s.modalTitle, textAlign:"center" }}>新增食材</h2>
        <p style={{ color:"#64748b", fontSize:13, marginBottom:24 }}>請選擇新增方式</p>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <button style={s.choiceBtn} onClick={onManual}>
            <span style={{ fontSize:28 }}>✏️</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:"#0c4a6e" }}>手動輸入</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>自行填寫食材資料</div>
            </div>
          </button>
          <button style={{ ...s.choiceBtn, borderColor:"#c4b5fd", background:"#faf5ff" }} onClick={onCamera}>
            <span style={{ fontSize:28 }}>📷</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:"#5b21b6" }}>影像辨識</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>拍照或上傳照片，AI 自動辨識</div>
            </div>
          </button>
        </div>
        <button style={{ ...s.cancelBtn, marginTop:16, width:"100%" }} onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

// ── 影像辨識 Modal（含相機）────────────────────────────────────────
function ImageRecognizeModal({ onClose, onFill }) {
  const [mode, setMode]           = useState("choose"); // choose | camera | upload
  const [imgSrc, setImgSrc]       = useState(null);
  const [imgBase64, setImgBase64] = useState(null);
  const [imgMime, setImgMime]     = useState("image/jpeg");
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState(null);
  const [error, setError]         = useState("");
  const [camError, setCamError]   = useState("");

  const fileRef    = useRef();
  const videoRef   = useRef();
  const canvasRef  = useRef();
  const streamRef  = useRef(null);

  // 開啟相機
  const startCamera = useCallback(async () => {
    setCamError("");
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:"environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCamError("無法存取相機，請確認已授予相機權限，或改用上傳方式。");
    }
  }, []);

  // 停止相機
  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  // 拍照
  const capture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg");
    setImgSrc(dataUrl);
    setImgBase64(dataUrl.split(",")[1]);
    setImgMime("image/jpeg");
    stopCamera();
    setMode("preview");
  };

  // 上傳檔案
  const handleFile = (file) => {
    if (!file) return;
    setImgMime(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (e) => {
      setImgSrc(e.target.result);
      setImgBase64(e.target.result.split(",")[1]);
      setResults(null); setError("");
      setMode("preview");
    };
    reader.readAsDataURL(file);
  };

  // 重設
  const reset = () => { stopCamera(); setImgSrc(null); setImgBase64(null); setResults(null); setError(""); setMode("choose"); };

  // 關閉
  const handleClose = () => { stopCamera(); onClose(); };

  // AI 辨識
  const recognize = async () => {
    if (!imgBase64) return;
    setLoading(true); setError(""); setResults(null);
    try {
      const res  = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          messages:[{ role:"user", content:[
            { type:"image", source:{ type:"base64", media_type:imgMime, data:imgBase64 } },
            { type:"text",  text:`請辨識圖片中的食材。只回傳 JSON 陣列，不要任何其他文字或 markdown：
[{"name":"食材名稱（繁體中文）","category":"分類（只能是：蔬菜、水果、肉類、乳製品、飲料、調味料、冷凍食品、其他）","quantity":"估計數量（如：1顆、適量、1包）","note":"保存建議或備註，沒有就空字串"}]` }
          ]}]
        })
      });
      const data  = await res.json();
      const text  = (data.content||[]).map(c=>c.text||"").join("");
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setResults(Array.isArray(parsed) ? parsed : [parsed]);
    } catch { setError("辨識失敗，請確認圖片清晰或再試一次。"); }
    setLoading(false);
  };

  return (
    <div style={s.overlay} onClick={handleClose}>
      <div style={{ ...s.modal, maxWidth:520, maxHeight:"92vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <h2 style={s.modalTitle}>📷 影像辨識食材</h2>

        {/* ── 選擇方式 ── */}
        {mode === "choose" && (
          <>
            <p style={{ color:"#64748b", fontSize:13, marginBottom:16 }}>選擇圖片來源，AI 自動辨識食材</p>
            <div style={{ display:"flex", gap:12 }}>
              <button style={{ ...s.srcBtn, borderColor:"#7c3aed", color:"#5b21b6" }} onClick={startCamera}>
                <span style={{ fontSize:28 }}>📸</span>
                <div style={{ fontWeight:700 }}>開啟相機拍照</div>
                <div style={{ fontSize:11, color:"#94a3b8" }}>使用裝置相機</div>
              </button>
              <button style={{ ...s.srcBtn, borderColor:"#0ea5e9", color:"#0369a1" }} onClick={() => fileRef.current.click()}>
                <span style={{ fontSize:28 }}>🖼️</span>
                <div style={{ fontWeight:700 }}>上傳照片</div>
                <div style={{ fontSize:11, color:"#94a3b8" }}>JPG / PNG / WEBP</div>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
            {camError && <div style={{ ...s.errorBox, marginTop:12 }}>{camError}</div>}
          </>
        )}

        {/* ── 相機畫面 ── */}
        {mode === "camera" && (
          <>
            <p style={{ color:"#64748b", fontSize:13, marginBottom:12 }}>對準食材，按下拍照</p>
            <div style={{ position:"relative", borderRadius:16, overflow:"hidden", background:"#000", lineHeight:0 }}>
              <video ref={videoRef} autoPlay playsInline style={{ width:"100%", borderRadius:16, display:"block" }} />
              <canvas ref={canvasRef} style={{ display:"none" }} />
            </div>
            {camError && <div style={{ ...s.errorBox, marginTop:12 }}>{camError}</div>}
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button style={s.cancelBtn} onClick={reset}>取消</button>
              <button style={{ ...s.saveBtn, background:"linear-gradient(135deg,#7c3aed,#5b21b6)" }} onClick={capture}>📸 拍照</button>
            </div>
          </>
        )}

        {/* ── 預覽 + 辨識 ── */}
        {mode === "preview" && (
          <>
            <div style={{ borderRadius:12, overflow:"hidden", marginBottom:12, background:"#f8fafc", lineHeight:0 }}>
              <img src={imgSrc} alt="preview" style={{ width:"100%", maxHeight:240, objectFit:"contain", borderRadius:12 }} />
            </div>
            {!results && (
              <div style={{ display:"flex", gap:8 }}>
                <button style={s.cancelBtn} onClick={reset}>重新選擇</button>
                <button style={{ ...s.saveBtn, background:"linear-gradient(135deg,#7c3aed,#5b21b6)", opacity:loading?0.7:1 }}
                  onClick={recognize} disabled={loading}>
                  {loading ? "辨識中…" : "🔍 開始辨識"}
                </button>
              </div>
            )}
            {loading && (
              <div style={s.loadingBox}>
                <div style={s.spinner} />
                <span style={{ color:"#0369a1", fontSize:14 }}>AI 正在分析圖片中的食材…</span>
              </div>
            )}
            {error && <div style={s.errorBox}>{error}</div>}
            {results && (
              <div style={{ marginTop:16 }}>
                <p style={{ fontWeight:700, color:"#0c4a6e", fontSize:14, marginBottom:10 }}>
                  ✅ 辨識到 {results.length} 種食材，點擊「使用」填入表單：
                </p>
                {results.map((item, i) => (
                  <div key={i} style={s.resultCard}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:24 }}>{CATEGORY_ICONS[item.category]||"📦"}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, color:"#0c4a6e" }}>{item.name}</div>
                        <div style={{ fontSize:12, color:"#64748b" }}>{item.category} · {item.quantity}</div>
                        {item.note && <div style={{ fontSize:12, color:"#94a3b8" }}>📝 {item.note}</div>}
                      </div>
                      <button style={s.useBtn} onClick={()=>onFill(item)}>使用</button>
                    </div>
                  </div>
                ))}
                <button style={{ ...s.cancelBtn, marginTop:8, width:"100%" }} onClick={reset}>再辨識一張</button>
              </div>
            )}
          </>
        )}

        <button style={{ ...s.cancelBtn, marginTop:16, width:"100%" }} onClick={handleClose}>關閉</button>
      </div>
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────────
export default function FridgeManager() {
  // 持久登入：從 localStorage 讀取
  const [user, setUser]           = useState(() => {
    try { return JSON.parse(localStorage.getItem("fridgeUser")) || null; } catch { return null; }
  });
  const [loginForm, setLoginForm] = useState({ username:"", password:"" });
  const [loginError, setLoginError] = useState("");

  const [items, setItems]           = useState(DEMO_ITEMS);
  const [activeCategory, setActiveCategory] = useState("全部");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab]   = useState("list");

  // Modal 狀態：null | "choice" | "manual" | "image" | "edit"
  const [modal, setModal]       = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm]         = useState({ name:"", category:"蔬菜", quantity:"", expiry:"", note:"" });

  // 登入 → 存入 localStorage
  const handleLogin = () => {
    if (loginForm.username === "admin" && loginForm.password === "1234") {
      const u = { name: loginForm.username, avatar: loginForm.username[0].toUpperCase() };
      setUser(u);
      localStorage.setItem("fridgeUser", JSON.stringify(u));
      setLoginError("");
    } else setLoginError("帳號或密碼錯誤，請重試");
  };

  // 登出 → 清除 localStorage
  const handleLogout = () => { setUser(null); localStorage.removeItem("fridgeUser"); };

  const openManual = () => { setForm({ name:"", category:"蔬菜", quantity:"", expiry:"", note:"" }); setEditItem(null); setModal("manual"); };
  const openEdit   = (item) => { setForm({...item}); setEditItem(item.id); setModal("edit"); };

  const handleFillFromImage = (item) => {
    setForm({ name:item.name||"", category:item.category||"其他", quantity:item.quantity||"", expiry:"", note:item.note||"" });
    setEditItem(null); setModal("manual");
  };

  const handleSave = () => {
    if (!form.name || !form.expiry) return;
    if (editItem) setItems(items.map(i => i.id === editItem ? {...form, id:editItem} : i));
    else setItems([...items, {...form, id:Date.now()}]);
    setModal(null);
  };

  const handleDelete = (id) => { setItems(items.filter(i=>i.id!==id)); setDeleteConfirm(null); };

  const filtered = items.filter(i =>
    (activeCategory === "全部" || i.category === activeCategory) &&
    (i.name.includes(searchTerm) || i.note?.includes(searchTerm))
  );
  const expiringSoon = items.filter(i => getDaysLeft(i.expiry) <= 3).sort((a,b) => getDaysLeft(a.expiry)-getDaysLeft(b.expiry));

  // ── 登入頁 ──
  if (!user) return (
    <div style={s.loginBg}>
      <div style={s.loginCard}>
        <div style={{ fontSize:56, textAlign:"center", marginBottom:8 }}>🧊</div>
        <h1 style={s.loginTitle}>冰箱管家</h1>
        <p style={s.loginSub}>管理食材，告別浪費</p>
        <div style={s.field}><label style={s.label}>帳號</label>
          <input style={s.input} placeholder="輸入帳號" value={loginForm.username}
            onChange={e=>setLoginForm({...loginForm,username:e.target.value})}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()} /></div>
        <div style={s.field}><label style={s.label}>密碼</label>
          <input style={s.input} type="password" placeholder="輸入密碼" value={loginForm.password}
            onChange={e=>setLoginForm({...loginForm,password:e.target.value})}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()} /></div>
        {loginError && <p style={s.loginError}>{loginError}</p>}
        <button style={s.loginBtn} onClick={handleLogin}>登入</button>
        <p style={s.loginHint}>測試帳號：admin / 密碼：1234</p>
      </div>
    </div>
  );

  // ── 主頁 ──
  return (
    <div style={s.app}>
      <header style={s.header}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:26 }}>🧊</span>
          <span style={s.headerTitle}>冰箱管家</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={s.avatar}>{user.avatar}</div>
          <span style={{ color:"#bae6fd", fontSize:14 }}>{user.name}</span>
          <button style={s.logoutBtn} onClick={handleLogout}>登出</button>
        </div>
      </header>

      {expiringSoon.length > 0 && (
        <div style={s.alertBanner}>
          ⚠️ 有 <b>{expiringSoon.length}</b> 樣食材即將到期或已過期！
          <button style={s.alertLink} onClick={()=>setActiveTab("alerts")}>查看提醒 →</button>
        </div>
      )}

      <div style={s.main}>
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          <button style={activeTab==="list"?s.tabActive:s.tab} onClick={()=>setActiveTab("list")}>📋 食材清單</button>
          <button style={activeTab==="alerts"?s.tabActive:s.tab} onClick={()=>setActiveTab("alerts")}>
            🔔 到期提醒 {expiringSoon.length>0 && <span style={s.badgeCount}>{expiringSoon.length}</span>}
          </button>
        </div>

        {activeTab === "list" && (<>
          <div style={s.toolbar}>
            <input style={s.searchInput} placeholder="🔍 搜尋食材名稱..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
            {/* 一個按鈕，按了跳選擇 Modal */}
            <button style={s.addBtn} onClick={()=>setModal("choice")}>＋ 新增食材</button>
          </div>
          <div style={s.categoryRow}>
            {CATEGORIES.map(c=>(
              <button key={c} style={activeCategory===c?s.catBtnActive:s.catBtn} onClick={()=>setActiveCategory(c)}>
                {c!=="全部"?CATEGORY_ICONS[c]+" ":""}{c}
              </button>
            ))}
          </div>
          <p style={{ color:"#64748b", fontSize:13, margin:"0 0 12px" }}>共 {filtered.length} 項食材</p>
          {filtered.length===0
            ? <div style={s.empty}><div style={{ fontSize:48 }}>🫙</div><p>沒有找到食材</p></div>
            : <div style={s.grid}>
                {filtered.map(item=>{
                  const days = getDaysLeft(item.expiry);
                  return (
                    <div key={item.id} style={{ ...s.card, ...(days<=2?s.cardUrgent:{}) }}>
                      <div style={s.cardTop}>
                        <span style={{ fontSize:28 }}>{CATEGORY_ICONS[item.category]||"📦"}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={s.cardName}>{item.name}</div>
                          <div style={s.cardMeta}>{item.category} · {item.quantity}</div>
                        </div>
                        <div style={{ display:"flex", gap:4 }}>
                          <button style={s.editBtn} onClick={()=>openEdit(item)}>✏️</button>
                          <button style={s.deleteBtn} onClick={()=>setDeleteConfirm(item.id)}>🗑️</button>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <span style={{ fontSize:12, color:"#64748b" }}>到期：{item.expiry}</span>
                        <ExpiryBadge days={days} />
                      </div>
                      {item.note && <div style={s.cardNote}>📝 {item.note}</div>}
                    </div>
                  );
                })}
              </div>
          }
        </>)}

        {activeTab === "alerts" && (
          <div>
            <h2 style={{ fontSize:18, fontWeight:700, color:"#0c4a6e", marginBottom:16 }}>🔔 到期提醒</h2>
            {expiringSoon.length===0
              ? <div style={s.empty}><div style={{ fontSize:48 }}>✅</div><p>目前沒有即將到期的食材，太棒了！</p></div>
              : <div style={s.grid}>
                  {expiringSoon.map(item=>(
                    <div key={item.id} style={{ ...s.card, ...s.cardUrgent }}>
                      <div style={s.cardTop}>
                        <span style={{ fontSize:28 }}>{CATEGORY_ICONS[item.category]||"📦"}</span>
                        <div style={{ flex:1 }}>
                          <div style={s.cardName}>{item.name}</div>
                          <div style={s.cardMeta}>{item.category} · {item.quantity}</div>
                        </div>
                        <button style={s.editBtn} onClick={()=>{openEdit(item);setActiveTab("list");}}>✏️</button>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <span style={{ fontSize:12, color:"#64748b" }}>到期：{item.expiry}</span>
                        <ExpiryBadge days={getDaysLeft(item.expiry)} />
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
      </div>

      {/* ── 新增方式選擇 ── */}
      {modal === "choice" && (
        <AddChoiceModal
          onManual={()=>{ openManual(); }}
          onCamera={()=>setModal("image")}
          onClose={()=>setModal(null)}
        />
      )}

      {/* ── 影像辨識 ── */}
      {modal === "image" && (
        <ImageRecognizeModal onClose={()=>setModal(null)} onFill={handleFillFromImage} />
      )}

      {/* ── 新增 / 編輯表單 ── */}
      {(modal === "manual" || modal === "edit") && (
        <div style={s.overlay} onClick={()=>setModal(null)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <h2 style={s.modalTitle}>{modal==="edit" ? "✏️ 編輯食材" : "＋ 新增食材"}</h2>
            <div style={s.field}><label style={s.label}>食材名稱 *</label>
              <input style={s.input} placeholder="例：牛奶" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></div>
            <div style={s.field}><label style={s.label}>分類</label>
              <select style={s.input} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                {CATEGORIES.filter(c=>c!=="全部").map(c=><option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
              </select></div>
            <div style={s.field}><label style={s.label}>數量</label>
              <input style={s.input} placeholder="例：2 瓶" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} /></div>
            <div style={s.field}><label style={s.label}>到期日 *</label>
              <input style={s.input} type="date" value={form.expiry} onChange={e=>setForm({...form,expiry:e.target.value})} /></div>
            <div style={s.field}><label style={s.label}>備註</label>
              <input style={s.input} placeholder="可選填..." value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
            <div style={s.modalBtns}>
              <button style={s.cancelBtn} onClick={()=>setModal(null)}>取消</button>
              <button style={s.saveBtn} onClick={handleSave}>{modal==="edit" ? "儲存變更" : "新增食材"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 刪除確認 ── */}
      {deleteConfirm && (
        <div style={s.overlay} onClick={()=>setDeleteConfirm(null)}>
          <div style={{ ...s.modal, maxWidth:360 }} onClick={e=>e.stopPropagation()}>
            <div style={{ textAlign:"center", fontSize:40, marginBottom:8 }}>🗑️</div>
            <h2 style={{ ...s.modalTitle, textAlign:"center" }}>確認刪除？</h2>
            <p style={{ textAlign:"center", color:"#666", marginBottom:24 }}>此操作無法復原</p>
            <div style={s.modalBtns}>
              <button style={s.cancelBtn} onClick={()=>setDeleteConfirm(null)}>取消</button>
              <button style={{ ...s.saveBtn, background:"#ef4444" }} onClick={()=>handleDelete(deleteConfirm)}>確認刪除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 樣式 ─────────────────────────────────────────────────────────
const s = {
  loginBg:   { minHeight:"100vh", background:"linear-gradient(135deg,#0f2027,#203a43,#2c5364)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Noto Sans TC',sans-serif" },
  loginCard: { background:"rgba(255,255,255,0.05)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:24, padding:"48px 40px", width:"100%", maxWidth:380, boxShadow:"0 32px 80px rgba(0,0,0,0.4)" },
  loginTitle:{ color:"#e0f2fe", fontSize:28, fontWeight:800, textAlign:"center", margin:"0 0 4px" },
  loginSub:  { color:"#94a3b8", fontSize:14, textAlign:"center", marginBottom:32 },
  loginError:{ color:"#f87171", fontSize:13, textAlign:"center", marginBottom:8, marginTop:-8 },
  loginBtn:  { width:"100%", padding:14, background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"#fff", border:"none", borderRadius:12, fontSize:16, fontWeight:700, cursor:"pointer", marginTop:8 },
  loginHint: { color:"#64748b", fontSize:12, textAlign:"center", marginTop:16 },
  app:       { minHeight:"100vh", background:"#f0f9ff", fontFamily:"'Noto Sans TC','PingFang TC',sans-serif" },
  header:    { background:"linear-gradient(135deg,#0c4a6e,#075985)", padding:"0 24px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 4px 20px rgba(0,0,0,0.2)" },
  headerTitle:{ color:"#fff", fontSize:20, fontWeight:800, letterSpacing:2 },
  avatar:    { width:34, height:34, borderRadius:"50%", background:"#0ea5e9", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:15 },
  logoutBtn: { background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"#e0f2fe", borderRadius:8, padding:"6px 14px", fontSize:13, cursor:"pointer" },
  alertBanner:{ background:"#fef3c7", borderBottom:"2px solid #f59e0b", padding:"10px 24px", display:"flex", alignItems:"center", gap:10, fontSize:14, color:"#92400e" },
  alertLink: { background:"none", border:"none", color:"#b45309", fontWeight:700, cursor:"pointer", fontSize:14, marginLeft:"auto" },
  main:      { maxWidth:900, margin:"0 auto", padding:"24px 16px" },
  tab:       { padding:"10px 20px", borderRadius:10, border:"2px solid #bae6fd", background:"#fff", color:"#0369a1", cursor:"pointer", fontWeight:600, fontSize:14, display:"flex", alignItems:"center", gap:6 },
  tabActive: { padding:"10px 20px", borderRadius:10, border:"2px solid #0ea5e9", background:"#0ea5e9", color:"#fff", cursor:"pointer", fontWeight:700, fontSize:14, display:"flex", alignItems:"center", gap:6 },
  badgeCount:{ background:"#ef4444", color:"#fff", borderRadius:999, fontSize:11, padding:"1px 7px", fontWeight:700 },
  toolbar:   { display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" },
  searchInput:{ flex:1, minWidth:160, padding:"10px 16px", borderRadius:10, border:"2px solid #bae6fd", fontSize:14, outline:"none", background:"#fff" },
  addBtn:    { padding:"10px 20px", background:"linear-gradient(135deg,#0ea5e9,#0369a1)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" },
  categoryRow:{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 },
  catBtn:    { padding:"6px 14px", borderRadius:20, border:"1.5px solid #bae6fd", background:"#fff", color:"#0369a1", fontSize:13, cursor:"pointer", fontWeight:500 },
  catBtnActive:{ padding:"6px 14px", borderRadius:20, border:"1.5px solid #0ea5e9", background:"#0ea5e9", color:"#fff", fontSize:13, cursor:"pointer", fontWeight:700 },
  grid:      { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 },
  card:      { background:"#fff", borderRadius:16, padding:16, boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:"1.5px solid #e0f2fe" },
  cardUrgent:{ border:"1.5px solid #fca5a5", background:"#fff7f7" },
  cardTop:   { display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 },
  cardName:  { fontWeight:700, fontSize:16, color:"#0c4a6e", marginBottom:2 },
  cardMeta:  { fontSize:12, color:"#94a3b8" },
  editBtn:   { background:"#eff6ff", border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:14 },
  deleteBtn: { background:"#fff1f2", border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:14 },
  cardNote:  { fontSize:12, color:"#94a3b8", marginTop:8, padding:"6px 10px", background:"#f8fafc", borderRadius:8 },
  bExp:   { background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:700 },
  bToday: { background:"#ffedd5", color:"#ea580c", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:700 },
  bWarn:  { background:"#fef3c7", color:"#d97706", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:700 },
  bSoon:  { background:"#fef9c3", color:"#ca8a04", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:700 },
  bOk:    { background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:700 },
  empty:  { textAlign:"center", padding:"60px 20px", color:"#94a3b8", fontSize:15 },
  overlay:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 },
  modal:  { background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:440, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" },
  modalTitle:{ fontSize:20, fontWeight:800, color:"#0c4a6e", margin:"0 0 20px" },
  modalBtns: { display:"flex", gap:10, marginTop:8 },
  cancelBtn: { flex:1, padding:12, borderRadius:10, border:"1.5px solid #e2e8f0", background:"#f8fafc", color:"#64748b", fontWeight:600, cursor:"pointer", fontSize:14 },
  saveBtn:   { flex:1, padding:12, borderRadius:10, border:"none", background:"linear-gradient(135deg,#0ea5e9,#0369a1)", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:14 },
  field:  { marginBottom:14 },
  label:  { display:"block", fontSize:13, fontWeight:600, color:"#475569", marginBottom:6 },
  input:  { width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid #e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box", background:"#f8fafc" },
  // Choice modal
  choiceBtn: { display:"flex", alignItems:"center", gap:14, padding:"16px 18px", borderRadius:14, border:"2px solid #bae6fd", background:"#f0f9ff", cursor:"pointer", width:"100%", textAlign:"left" },
  // Image source selector
  srcBtn: { display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"20px 12px", borderRadius:14, border:"2px solid", background:"#faf5ff", cursor:"pointer", flex:1, textAlign:"center", fontSize:13 },
  // Recognize results
  loadingBox: { display:"flex", alignItems:"center", gap:12, padding:16, background:"#f0f9ff", borderRadius:12, marginTop:12 },
  spinner:    { width:20, height:20, border:"3px solid #bae6fd", borderTopColor:"#0ea5e9", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
  errorBox:   { background:"#fff1f2", color:"#dc2626", borderRadius:10, padding:"12px 16px", marginTop:12, fontSize:14 },
  resultCard: { background:"#f8fafc", borderRadius:12, padding:"12px 14px", marginBottom:8, border:"1.5px solid #e0f2fe" },
  useBtn:     { padding:"6px 16px", background:"linear-gradient(135deg,#0ea5e9,#0369a1)", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" },
};
