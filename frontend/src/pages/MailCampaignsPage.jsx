import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { API } from "../styles.js";
import { ReachCTLogo } from "../components/icons.jsx";

// ─── Left Panel ───────────────────────────────────────────────────────────────
function LeftPanel({ user, activePage, onNav }) {
  const navItem = (label, page, icon) => (
    <button onClick={() => onNav(page)} style={{
      display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left",
      background: activePage===page ? "rgba(232,0,90,0.12)" : "none",
      border: activePage===page ? "1px solid rgba(232,0,90,0.2)" : "1px solid transparent",
      borderRadius:8, padding:"8px 12px", cursor:"pointer",
      color: activePage===page ? "#E8005A" : "#888", fontSize:12, fontWeight: activePage===page ? 600 : 400,
      fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s",
    }}>{icon} {label}</button>
  );

  return (
    <aside style={{ width:200, minHeight:"100vh", background:"#111", borderRight:"1px solid #1e1e1e",
      display:"flex", flexDirection:"column", padding:"20px 0", flexShrink:0 }}>
      <div style={{ padding:"0 16px 20px", borderBottom:"1px solid #1e1e1e", cursor:"pointer" }}
        onClick={() => onNav("/")}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <ReachCTLogo size={20} />
          <span style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:"#fff" }}>
            Reach<span style={{ color:"#E8005A" }}>CT</span>
          </span>
        </div>
      </div>
      <div style={{ padding:"16px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
          {user?.picture
            ? <img src={user.picture} alt="" referrerPolicy="no-referrer"
                style={{ width:32, height:32, borderRadius:"50%", objectFit:"cover", border:"2px solid #333" }} />
            : <div style={{ width:32, height:32, borderRadius:"50%", background:"#E8005A",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:13, fontWeight:700, color:"#fff" }}>
                {(user?.name||"?")[0].toUpperCase()}
              </div>
          }
          <div style={{ overflow:"hidden" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#fff", overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:120 }}>{user?.name||"User"}</div>
            <div style={{ fontSize:10, color:"#555", overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:120 }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          {navItem("Databases", "databases", "🗄️")}
          {navItem("Mail Campaigns", "campaigns", "📧")}
        </div>
      </div>
    </aside>
  );
}

// ─── Connect Mailrelay Card ───────────────────────────────────────────────────
function ConnectCard({ onConnected }) {
  const { token }         = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/mailrelay/connect`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body:JSON.stringify({api_key: apiKey.trim()}),
      });
      if (!res.ok) { const e=await res.json(); throw new Error(e.detail||"Connection failed"); }
      onConnected();
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      flex:1, padding:40 }}>
      <div style={{ background:"#fff", border:"1px solid #eee", borderRadius:20,
        padding:"40px 48px", maxWidth:460, width:"100%", textAlign:"center",
        boxShadow:"0 4px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📧</div>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800,
          color:"#111", marginBottom:8, letterSpacing:"-0.4px" }}>Link Mailrelay Account</h2>
        <p style={{ fontSize:14, color:"#888", marginBottom:28, lineHeight:1.6 }}>
          Connect your Mailrelay account to create email campaigns directly from your ReachCT contacts.
          Find your API key in <strong>Mailrelay → Settings → API</strong>.
        </p>
        <input value={apiKey} onChange={e=>setApiKey(e.target.value)}
          placeholder="Paste your Mailrelay API key"
          type="password"
          style={{ width:"100%", padding:"11px 16px", border:"1.5px solid #e8e8e8",
            borderRadius:10, fontSize:14, fontFamily:"'DM Sans',sans-serif",
            color:"#111", outline:"none", marginBottom:16, boxSizing:"border-box",
            transition:"border-color 0.15s" }}
          onFocus={e=>e.target.style.borderColor="#E8005A"}
          onBlur={e=>e.target.style.borderColor="#e8e8e8"}
          onKeyDown={e=>e.key==="Enter"&&handleConnect()} />
        {error && <div style={{ fontSize:13, color:"#E8005A", marginBottom:12 }}>{error}</div>}
        <button onClick={handleConnect} disabled={!apiKey.trim()||loading} style={{
          width:"100%", background:"#E8005A", border:"none", borderRadius:10,
          padding:"12px 0", color:"#fff", fontSize:14, fontWeight:600,
          cursor:apiKey.trim()?"pointer":"not-allowed", fontFamily:"'DM Sans',sans-serif",
          opacity:apiKey.trim()?1:0.5, transition:"all 0.15s" }}>
          {loading?"Connecting…":"Connect Mailrelay"}
        </button>
      </div>
    </div>
  );
}

// ─── Create Campaign Wizard ───────────────────────────────────────────────────
function CreateCampaignModal({ onClose, onCreate, token }) {
  const [step, setStep]             = useState(1);
  const [name, setName]             = useState("");
  const [databases, setDatabases]   = useState([]);
  const [selectedDb, setSelectedDb] = useState(null);
  const [entries, setEntries]       = useState([]);
  const [selectedEmails, setSelectedEmails] = useState(new Set());
  const [subject, setSubject]       = useState("");
  const [body, setBody]             = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName]   = useState("");
  const [generating, setGenerating]   = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  useEffect(() => {
    fetch(`${API}/api/databases`, { headers:{Authorization:`Bearer ${token}`} })
      .then(r=>r.json()).then(d=>setDatabases(Array.isArray(d)?d:[])).catch(()=>{});
  }, []);

  const loadEntries = async (dbId) => {
    setSelectedDb(dbId);
    const res  = await fetch(`${API}/api/databases/${dbId}/entries`, { headers:{Authorization:`Bearer ${token}`} });
    const data = await res.json();
    const real = Array.isArray(data) ? data.filter(e =>
      Object.values(e.data||{}).some(v=>v&&String(v).trim())
    ) : [];
    setEntries(real);
    // Auto-select all with valid emails
    const withEmail = new Set(real.filter(e=>e.data?.email&&e.data.email.includes("@")).map(e=>e.id));
    setSelectedEmails(withEmail);
  };

  const toggleEmail = (id) => setSelectedEmails(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectedContacts = entries
    .filter(e => selectedEmails.has(e.id))
    .map(e => ({ name: e.data?.name||"", email: e.data?.email||"", company: e.data?.name||"" }));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const db   = databases.find(d=>d.id===selectedDb);
      const res  = await fetch(`${API}/api/campaigns/generate`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body:JSON.stringify({
          campaign_name: name,
          company_type:  db?.name||"",
          sample_contacts: selectedContacts.slice(0,5),
        }),
      });
      const data = await res.json();
      setSubject(data.subject||"");
      setBody(data.body||"");
    } catch { setError("Failed to generate email content"); }
    setGenerating(false);
  };

  const handleCreate = async () => {
    if (!subject||!body||!senderEmail) { setError("Please fill in all fields."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/campaigns`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body:JSON.stringify({
          name, subject, body,
          contacts: selectedContacts,
          sender_email: senderEmail,
          sender_name:  senderName,
        }),
      });
      if (!res.ok) { const e=await res.json(); throw new Error(e.detail||"Failed"); }
      const data = await res.json();
      onCreate(data);
      onClose();
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const stepLabel = ["Name & Contacts", "Write Email", "Review & Send"];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
      onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:16, padding:32, width:"100%", maxWidth:600,
        maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}
        onClick={e=>e.stopPropagation()}>

        {/* Step indicator */}
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          {stepLabel.map((label, i) => (
            <div key={i} style={{ flex:1, textAlign:"center" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", margin:"0 auto 4px",
                background: step===i+1 ? "#E8005A" : step>i+1 ? "#111" : "#eee",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12, fontWeight:700, color: step>=i+1 ? "#fff" : "#999" }}>
                {step>i+1 ? "✓" : i+1}
              </div>
              <div style={{ fontSize:11, color: step===i+1 ? "#E8005A" : "#999",
                fontFamily:"'DM Sans',sans-serif", fontWeight: step===i+1 ? 600 : 400 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Step 1 — Name + contacts */}
        {step===1 && (
          <>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800,
              color:"#111", margin:"0 0 20px" }}>Name & Select Contacts</h2>
            <div style={{ marginBottom:16 }}>
              <label style={labelStyle}>Campaign Name</label>
              <input value={name} onChange={e=>setName(e.target.value)}
                placeholder="e.g. Barcelona Marketing Outreach Q3"
                style={inputStyle} />
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={labelStyle}>Select Database</label>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {databases.map(db => (
                  <div key={db.id} onClick={()=>loadEntries(db.id)} style={{
                    border: selectedDb===db.id ? "2px solid #E8005A" : "1.5px solid #eee",
                    borderRadius:10, padding:"12px 16px", cursor:"pointer",
                    background: selectedDb===db.id ? "rgba(232,0,90,0.03)" : "#fff",
                    transition:"all 0.15s",
                  }}>
                    <div style={{ fontWeight:600, color:"#111", fontSize:14 }}>{db.name}</div>
                    <div style={{ fontSize:12, color:"#999", marginTop:2 }}>{db.rows||0} rows</div>
                  </div>
                ))}
              </div>
            </div>
            {entries.length > 0 && (
              <div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <label style={labelStyle}>Select Contacts ({selectedEmails.size} selected)</label>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>setSelectedEmails(new Set(entries.filter(e=>e.data?.email?.includes("@")).map(e=>e.id)))}
                      style={{ fontSize:11, color:"#E8005A", background:"none", border:"none", cursor:"pointer" }}>
                      All with email</button>
                    <button onClick={()=>setSelectedEmails(new Set())}
                      style={{ fontSize:11, color:"#999", background:"none", border:"none", cursor:"pointer" }}>
                      Clear</button>
                  </div>
                </div>
                <div style={{ maxHeight:200, overflowY:"auto", border:"1px solid #eee",
                  borderRadius:10, fontSize:13 }}>
                  {entries.map(entry => {
                    const hasEmail = entry.data?.email?.includes("@");
                    return (
                      <div key={entry.id} onClick={()=>hasEmail&&toggleEmail(entry.id)} style={{
                        display:"flex", alignItems:"center", gap:10, padding:"9px 14px",
                        borderBottom:"1px solid #f5f5f5", cursor:hasEmail?"pointer":"not-allowed",
                        opacity:hasEmail?1:0.4, background:selectedEmails.has(entry.id)?"rgba(232,0,90,0.03)":"#fff",
                      }}>
                        <input type="checkbox" checked={selectedEmails.has(entry.id)}
                          onChange={()=>hasEmail&&toggleEmail(entry.id)}
                          onClick={e=>e.stopPropagation()} disabled={!hasEmail} />
                        <div style={{ flex:1, overflow:"hidden" }}>
                          <div style={{ fontWeight:500, color:"#111", whiteSpace:"nowrap",
                            overflow:"hidden", textOverflow:"ellipsis" }}>
                            {entry.data?.name||"Unnamed"}</div>
                          <div style={{ fontSize:12, color: hasEmail ? "#E8005A" : "#ccc" }}>
                            {entry.data?.email||"No email"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:24 }}>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button onClick={()=>setStep(2)}
                disabled={!name.trim()||selectedEmails.size===0}
                style={{ ...primaryBtnStyle, opacity:name.trim()&&selectedEmails.size>0?1:0.5 }}>
                Next → Write Email</button>
            </div>
          </>
        )}

        {/* Step 2 — Email content */}
        {step===2 && (
          <>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800,
              color:"#111", margin:"0 0 8px" }}>Write Your Email</h2>
            <p style={{ fontSize:13, color:"#999", marginBottom:20 }}>
              Sending to <strong>{selectedEmails.size}</strong> contacts.
              Use <code style={{ background:"#f5f5f5", padding:"1px 5px", borderRadius:4 }}>{"{{name}}"}</code> and <code style={{ background:"#f5f5f5", padding:"1px 5px", borderRadius:4 }}>{"{{company}}"}</code> as merge tags.
            </p>
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
              <button onClick={handleGenerate} disabled={generating} style={{
                background:"linear-gradient(135deg,#E8005A,#ff6b9d)", border:"none",
                borderRadius:8, padding:"8px 16px", color:"#fff", fontSize:13,
                fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                display:"flex", alignItems:"center", gap:6,
              }}>
                {generating ? "Generating…" : "✦ Generate with AI"}
              </button>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={labelStyle}>Subject Line</label>
              <input value={subject} onChange={e=>setSubject(e.target.value)}
                placeholder="e.g. Partnership opportunity for {{company}}"
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email Body (HTML supported)</label>
              <textarea value={body} onChange={e=>setBody(e.target.value)}
                placeholder="Write your email here… or use Generate with AI above"
                rows={10} style={{ ...inputStyle, resize:"vertical", lineHeight:1.5 }} />
            </div>
            {error && <div style={{ fontSize:13, color:"#E8005A", marginTop:8 }}>{error}</div>}
            <div style={{ display:"flex", justifyContent:"space-between", gap:10, marginTop:24 }}>
              <button onClick={()=>setStep(1)} style={cancelBtnStyle}>← Back</button>
              <button onClick={()=>setStep(3)} disabled={!subject||!body}
                style={{ ...primaryBtnStyle, opacity:subject&&body?1:0.5 }}>
                Next → Review</button>
            </div>
          </>
        )}

        {/* Step 3 — Sender + confirm */}
        {step===3 && (
          <>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800,
              color:"#111", margin:"0 0 8px" }}>Review & Create Campaign</h2>
            <p style={{ fontSize:13, color:"#999", marginBottom:20 }}>
              ReachCT will create a group and campaign draft in Mailrelay. You'll confirm and send from Mailrelay directly.
            </p>
            <div style={{ background:"#f8f8f8", borderRadius:12, padding:16, marginBottom:20, fontSize:13 }}>
              <div style={{ fontWeight:600, color:"#111", marginBottom:4 }}>{name}</div>
              <div style={{ color:"#666" }}>Subject: {subject}</div>
              <div style={{ color:"#666" }}>Recipients: {selectedEmails.size} contacts</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
              <div>
                <label style={labelStyle}>Sender Name</label>
                <input value={senderName} onChange={e=>setSenderName(e.target.value)}
                  placeholder="e.g. Liem from Spain Internship"
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Sender Email</label>
                <input value={senderEmail} onChange={e=>setSenderEmail(e.target.value)}
                  placeholder="e.g. liem@spainternship.com"
                  type="email" style={inputStyle} />
              </div>
            </div>
            <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10,
              padding:"12px 16px", fontSize:13, color:"#166534", marginBottom:16 }}>
              ℹ️ After clicking Create Campaign, go to <strong>app.mailrelay.com</strong> to review and send.
            </div>
            {error && <div style={{ fontSize:13, color:"#E8005A", marginBottom:12 }}>{error}</div>}
            <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
              <button onClick={()=>setStep(2)} style={cancelBtnStyle}>← Back</button>
              <button onClick={handleCreate} disabled={!senderEmail||loading}
                style={{ ...primaryBtnStyle, opacity:senderEmail?1:0.5 }}>
                {loading?"Creating…":"Create Campaign in Mailrelay"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  display:"block", fontSize:11, fontWeight:600, color:"#999",
  letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6,
  fontFamily:"'DM Sans',sans-serif",
};
const inputStyle = {
  width:"100%", padding:"10px 14px", border:"1.5px solid #e8e8e8",
  borderRadius:10, fontSize:14, fontFamily:"'DM Sans',sans-serif",
  color:"#111", background:"#fff", outline:"none", boxSizing:"border-box",
};
const primaryBtnStyle = {
  background:"#E8005A", border:"none", borderRadius:8, padding:"9px 20px",
  color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer",
  fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s",
};
const cancelBtnStyle = {
  background:"none", border:"1px solid #e8e8e8", borderRadius:8,
  padding:"9px 18px", color:"#666", fontSize:13, cursor:"pointer",
  fontFamily:"'DM Sans',sans-serif",
};

// ─── Mail Campaigns Page ──────────────────────────────────────────────────────
export default function MailCampaignsPage() {
  const { user, token }         = useAuth();
  const navigate                = useNavigate();
  const [connected, setConnected] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    checkStatus();
  }, [token]);

  const checkStatus = async () => {
    try {
      const [statusRes, campaignsRes] = await Promise.all([
        fetch(`${API}/api/mailrelay/status`, { headers:{Authorization:`Bearer ${token}`} }),
        fetch(`${API}/api/campaigns`, { headers:{Authorization:`Bearer ${token}`} }),
      ]);
      const status    = await statusRes.json();
      const campaigns = await campaignsRes.json();
      setConnected(status.connected);
      setCampaigns(Array.isArray(campaigns)?campaigns:[]);
    } catch {}
    setLoading(false);
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your Mailrelay account?")) return;
    await fetch(`${API}/api/mailrelay/disconnect`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} });
    setConnected(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this campaign record?")) return;
    await fetch(`${API}/api/campaigns/${id}`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} });
    setCampaigns(prev=>prev.filter(c=>c.id!==id));
  };

  if (loading) return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#0a0a0a" }}>
      <LeftPanel user={user} activePage="campaigns" onNav={p=>p==="/"?navigate("/"):p==="databases"?navigate("/dashboard"):null}/>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ width:32, height:32, borderRadius:"50%", border:"3px solid #333",
          borderTopColor:"#E8005A", animation:"spin 0.8s linear infinite" }} />
      </div>
    </div>
  );

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#0a0a0a" }}>
      <LeftPanel user={user} activePage="campaigns"
        onNav={p=>p==="/"?navigate("/"):p==="databases"?navigate("/dashboard"):null} />

      <main style={{ flex:1, padding:"36px 40px", overflowY:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800,
              color:"#fff", letterSpacing:"-0.5px", margin:0 }}>Mail Campaigns</h1>
            <p style={{ color:"#444", fontSize:13, marginTop:4 }}>
              {connected ? (
                <span>Connected to Mailrelay ✅ &nbsp;
                  <button onClick={handleDisconnect} style={{ background:"none", border:"none",
                    color:"#555", fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                    textDecoration:"underline" }}>Disconnect</button>
                </span>
              ) : "Connect your Mailrelay account to get started"}
            </p>
          </div>
          {connected && (
            <button onClick={()=>setShowCreate(true)} style={{
              background:"#E8005A", border:"none", borderRadius:10, padding:"10px 20px",
              color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:6,
            }}>+ Create Campaign</button>
          )}
        </div>

        {!connected ? (
          <ConnectCard onConnected={()=>{ setConnected(true); }} />
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:14 }}>
            {/* Create card */}
            <div onClick={()=>setShowCreate(true)} style={{ border:"1.5px dashed #333",
              borderRadius:12, padding:"24px 20px", cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", gap:10, minHeight:150, transition:"all 0.2s" }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor="#E8005A"; e.currentTarget.style.background="rgba(232,0,90,0.04)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor="#333"; e.currentTarget.style.background="none"; }}>
              <div style={{ width:34, height:34, borderRadius:"50%", background:"rgba(232,0,90,0.1)",
                border:"1px solid rgba(232,0,90,0.2)", display:"flex", alignItems:"center",
                justifyContent:"center", fontSize:20, color:"#E8005A" }}>+</div>
              <span style={{ fontSize:12, fontWeight:600, color:"#555", fontFamily:"'DM Sans',sans-serif" }}>
                Create Campaign</span>
            </div>

            {/* Campaign cards */}
            {campaigns.map(c => (
              <div key={c.id} style={{ background:"#111", border:"1px solid #1e1e1e",
                borderRadius:12, padding:20, transition:"all 0.2s",
                display:"flex", flexDirection:"column", justifyContent:"space-between", minHeight:150 }}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#333"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#1e1e1e"}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <span style={{ fontSize:10, fontWeight:600, color:"#E8005A",
                      textTransform:"uppercase", letterSpacing:"0.06em" }}>
                      {c.status||"draft"}
                    </span>
                    <span style={{ fontSize:11, color:"#555" }}>
                      {c.contact_count} contacts
                    </span>
                  </div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700,
                    color:"#fff", marginBottom:6, letterSpacing:"-0.3px" }}>{c.name}</div>
                  <div style={{ fontSize:12, color:"#555", overflow:"hidden",
                    textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.subject}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:14 }}>
                  <span style={{ fontSize:11, color:"#444" }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                  <div style={{ display:"flex", gap:8 }}>
                    <a href="https://app.mailrelay.com/campaigns" target="_blank" rel="noreferrer"
                      style={{ fontSize:12, color:"#E8005A", textDecoration:"none",
                        fontFamily:"'DM Sans',sans-serif" }}>
                      Open in Mailrelay →
                    </a>
                    <button onClick={()=>handleDelete(c.id)} style={{ background:"none", border:"none",
                      color:"#444", fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                      onMouseEnter={e=>e.target.style.color="#E8005A"} onMouseLeave={e=>e.target.style.color="#444"}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateCampaignModal
          onClose={()=>setShowCreate(false)}
          onCreate={data=>setCampaigns(prev=>[data.campaign,...prev])}
          token={token}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
