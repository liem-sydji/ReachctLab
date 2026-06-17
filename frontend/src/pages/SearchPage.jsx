import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { API, COMPANY_TYPES_GROUPED } from "../styles.js";
import { SearchIcon, DownloadIcon, CopyIcon, StopIcon } from "../components/icons.jsx";
import { InnerHeader, ResultsTable } from "../components/shared.jsx";
import AddToDBModal from "../components/AddToDBModal.jsx";

export default function SearchPage() {
  const navigate        = useNavigate();
  const { user, token } = useAuth();
  const [tab, setTab]   = useState("maps"); // "maps" | "linkedin"

  return (
    <div className="inner-page">
      <InnerHeader title="New Search" />

      {/* Tab switcher */}
      <div style={{ display:"flex", gap:8, padding:"0 24px", marginBottom:8 }}>
        <button onClick={()=>setTab("maps")} style={tabStyle(tab==="maps")}>
          🗺️ Google Maps
        </button>
        <button onClick={()=>setTab("linkedin")} style={tabStyle(tab==="linkedin")}>
          🔗 LinkedIn Search
        </button>
      </div>

      {tab === "maps"     && <MapsSearch user={user} token={token} navigate={navigate} />}
      {tab === "linkedin" && <LinkedInSearch user={user} token={token} />}
    </div>
  );
}

function tabStyle(active) {
  return {
    padding:"9px 18px", borderRadius:"10px 10px 0 0", border:"none", cursor:"pointer",
    fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif",
    background: active ? "#fff" : "transparent",
    color: active ? "#E8005A" : "#888",
    borderBottom: active ? "2px solid #E8005A" : "2px solid transparent",
  };
}

// ─── Google Maps Search (existing) ────────────────────────────────────────────
function MapsSearch({ user, token, navigate }) {
  const [query,    setQuery]    = useState("");
  const [city,     setCity]     = useState("");
  const [country,  setCountry]  = useState("");
  const [start,    setStart]    = useState(0);
  const [end,      setEnd]      = useState(25);
  const [loading,  setLoading]  = useState(false);
  const [loadMsg,  setLoadMsg]  = useState("");
  const [results,  setResults]  = useState([]);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState("");
  const [jobId,    setJobId]    = useState(null);
  const [showAddDB, setShowAddDB] = useState(false);
  const pollRef = useRef(null);

  const handleSearch = async () => {
    if (!query||!city||!country) { setError("Please fill in all fields."); return; }
    setError(""); setLoading(true); setSearched(false); setResults([]);
    setLoadMsg("Connecting to Google Maps...");
    try {
      const res  = await fetch(`${API}/api/scrape?query=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&start=${start}&end=${end}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail||"Failed to start search");
      setJobId(data.job_id);
      setLoadMsg("Your search is in progress — this may take a couple of minutes.");
      pollRef.current = setInterval(async () => {
        try {
          const jr = await fetch(`${API}/api/job/${data.job_id}`);
          const jd = await jr.json();
          if (jd.status==="done"||jd.status==="cancelled") {
            clearInterval(pollRef.current);
            setResults(jd.results||[]); setSearched(true); setLoading(false); setJobId(null);
          } else if (jd.status==="error") {
            clearInterval(pollRef.current); setError(jd.error||"Something went wrong"); setLoading(false);
          } else if (jd.queue_position>0||jd.status==="starting") {
            setLoadMsg(`Your search is in queue at position ${jd.queue_position||1} — results saved automatically.`);
          } else {
            setLoadMsg("Your search is in progress — this may take a couple of minutes.");
          }
        } catch {}
      }, 4000);
    } catch (e) { setError(e.message); setLoading(false); }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    try { await fetch(`${API}/api/job/${jobId}/cancel`, { method:"POST" }); setLoadMsg("Cancelling…"); } catch {}
  };

  const handleExport = () => {
    if (!results.length) return;
    import("xlsx").then(({ default: XLSX }) => {
      const headers = ["Company Name","Email","Phone","Website","City","Country","Company Type"];
      const rows    = results.map(r => [r.name||"",r.email||"",r.phone||"",r.website||"",r.city||"",r.country||"",r.company_type||""]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let row = 1; row <= range.e.r; row++) {
        const ref = XLSX.utils.encode_cell({ r: row, c: 2 });
        if (ws[ref]) { ws[ref].t = "s"; ws[ref].z = "@"; }
      }
      ws["!cols"] = [{wch:30},{wch:30},{wch:18},{wch:35},{wch:18},{wch:18},{wch:22}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ReachCT Export");
      XLSX.writeFile(wb, `reachct_maps_${new Date().toISOString().slice(0,10)}.xlsx`);
    });
  };

  const handleCopy = () => {
    if (!results.length) return;
    const headers = ["Company Name","Email","Phone","Website","City","Country","Company Type"];
    const rows    = results.map(r => [r.name||"",r.email||"",r.phone||"",r.website||"",r.city||"",r.country||"",r.company_type||""]);
    const tsv     = [headers,...rows].map(r=>r.join("\t")).join("\n");
    navigator.clipboard.writeText(tsv).then(()=>alert("Copied! Paste into Google Sheets or Excel."));
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  return (
    <>
      <div className="form-area">
        <div className="form-card">
          <div className="form-title">Search Google Maps</div>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 0.6fr 0.6fr", gap:16, marginBottom:16 }}>
            <div>
              <label className="field-label">Business Type</label>
              <select className="field-select" value={query} onChange={e=>setQuery(e.target.value)}>
                <option value="">Select company type…</option>
                {Object.entries(COMPANY_TYPES_GROUPED).map(([letter, types]) => (
                  <optgroup key={letter} label={`── ${letter} ──`}>
                    {types.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">City</label>
              <input className="field-input" value={city} onChange={e=>setCity(e.target.value)} placeholder="e.g. Munich"/>
            </div>
            <div>
              <label className="field-label">Country</label>
              <input className="field-input" value={country} onChange={e=>setCountry(e.target.value)} placeholder="e.g. Germany"/>
            </div>
            <div>
              <label className="field-label">Start</label>
              <input className="field-input" type="number" min="0" value={start}
                onChange={e=>{ const v=e.target.value; setStart(v===""?"":Number(v)); }}
                onBlur={e=>{ if(e.target.value==="") setStart(0); }}/>
            </div>
            <div>
              <label className="field-label">End (max +50)</label>
              <input className="field-input" type="number" min="1" value={end}
                onChange={e=>{ const v=e.target.value; setEnd(v===""?"":Math.min(Number(v),(start||0)+50)); }}
                onBlur={e=>{ if(e.target.value==="") setEnd(25); }}/>
            </div>
          </div>
          <p className="hint">Use English spelling — "Spain" not "España", "Munich" not "München"</p>
          <p className="batch-tip">
            💡 <strong>Tip:</strong> Run searches in batches of 25 for quicker results — e.g. 0→25, then 25→50.&nbsp;
            <button className="batch-tip-link" onClick={()=>navigate("/info")}>How to use ReachCT →</button>
          </p>
          <div className="btn-row">
            <button className="btn-primary" onClick={handleSearch} disabled={loading}>
              <SearchIcon/>{loading?"Searching…":"Search"}
            </button>
            {loading && <button className="btn-danger" onClick={handleCancel}><StopIcon/>Stop</button>}
          </div>
          {error && <div className="error-msg">{error}</div>}
          {loading && <div className="loading-area"><div className="spinner"/>
            <p className="loading-msg">{loadMsg}</p></div>}
        </div>
      </div>

      {searched && (
        <div className="results-area">
          <div className="results-header">
            <div className="results-count">
              <span>{results.length}</span> companies found &nbsp;·&nbsp;
              <span style={{ color:"#E8005A" }}>{results.filter(r=>r.email).length}</span> emails found
            </div>
            <div className="btn-row">
              {user && <button className="btn-primary" onClick={()=>setShowAddDB(true)}>+ Add to Database</button>}
              <button className="btn-secondary" onClick={handleExport}><DownloadIcon/>Export Excel</button>
              <button className="btn-secondary" onClick={handleCopy}><CopyIcon/>Copy Table</button>
            </div>
          </div>
          <ResultsTable data={results}/>
        </div>
      )}

      {showAddDB && (
        <AddToDBModal
          dbKind="maps"
          rows={results.map(r=>({ name:r.name||"", email:r.email||"", phone:r.phone||"",
            website:r.website||"", city:r.city||"", country:r.country||"", company_type:r.company_type||"" }))}
          onClose={()=>setShowAddDB(false)}
        />
      )}
    </>
  );
}

// ─── LinkedIn Search (new) ────────────────────────────────────────────────────
function LinkedInSearch({ user, token }) {
  const [mode,     setMode]     = useState("single"); // "single" | "bulk"
  const [role,     setRole]     = useState("");
  const [company,  setCompany]  = useState("");
  const [location, setLocation] = useState("");
  const [keyword,  setKeyword]  = useState("");
  const [domain,   setDomain]   = useState("");
  const [maxResults, setMaxResults] = useState(15);
  // Bulk state
  const [bulkText, setBulkText]   = useState("");
  const [bulkDbId, setBulkDbId]   = useState(0);
  const [maxPerCompany, setMaxPerCompany] = useState(5);
  const [mapsDatabases, setMapsDatabases] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [loadMsg,  setLoadMsg]  = useState("");
  const [results,  setResults]  = useState([]);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState("");
  const [showAddDB, setShowAddDB] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/databases`, { headers:{Authorization:`Bearer ${token}`} })
      .then(r=>r.json())
      .then(d => setMapsDatabases((Array.isArray(d)?d:[]).filter(db => (db.kind||"maps")==="maps")))
      .catch(()=>{});
  }, [token]);

  const handleBulkSearch = async () => {
    const items = bulkText.split("\n").map(l=>l.trim()).filter(Boolean);
    if (items.length === 0 && !bulkDbId) {
      setError("Paste a list or select a database."); return;
    }
    setError(""); setLoading(true); setSearched(false); setResults([]);
    setLoadMsg("Starting bulk LinkedIn search…");
    try {
      const res = await fetch(`${API}/api/linkedin/bulk`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body:JSON.stringify({ items, from_db_id:Number(bulkDbId), role, location, max_per_company:Number(maxPerCompany) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail||"Failed to start bulk search");
      pollRef.current = setInterval(async () => {
        try {
          const jr = await fetch(`${API}/api/linkedin/status/${data.job_id}`, {
            headers:{Authorization:`Bearer ${token}`},
          });
          const jd = await jr.json();
          if (jd.status==="done") {
            clearInterval(pollRef.current);
            setResults(jd.results||[]); setSearched(true); setLoading(false);
          } else if (jd.status==="error") {
            clearInterval(pollRef.current); setError(jd.error||"Search failed"); setLoading(false);
          } else {
            setLoadMsg(`Searching ${jd.processing||"…"} (${jd.company_index||0}/${jd.total_companies||0}) — ${jd.found||0} people found`);
          }
        } catch {}
      }, 3000);
    } catch (e) { setError(e.message); setLoading(false); }
  };

  const handleSearch = async () => {
    if (!role && !company && !keyword) {
      setError("Provide at least a role, company, or keyword."); return;
    }
    setError(""); setLoading(true); setSearched(false); setResults([]);
    setLoadMsg("Searching LinkedIn profiles via Google…");
    try {
      const res = await fetch(`${API}/api/linkedin/search`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body:JSON.stringify({ role, company, location, keyword, domain, max_results:Number(maxResults) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail||"Failed to start search");

      pollRef.current = setInterval(async () => {
        try {
          const jr = await fetch(`${API}/api/linkedin/status/${data.job_id}`, {
            headers:{Authorization:`Bearer ${token}`},
          });
          const jd = await jr.json();
          if (jd.status==="done") {
            clearInterval(pollRef.current);
            setResults(jd.results||[]); setSearched(true); setLoading(false);
          } else if (jd.status==="error") {
            clearInterval(pollRef.current); setError(jd.error||"Search failed"); setLoading(false);
          } else {
            setLoadMsg(`Found ${jd.found||0} people so far — verifying emails…`);
          }
        } catch {}
      }, 3000);
    } catch (e) { setError(e.message); setLoading(false); }
  };

  const handleExport = () => {
    if (!results.length) return;
    import("xlsx").then(({ default: XLSX }) => {
      const headers = ["Full Name","Job Title","Company","Email","Confidence","LinkedIn URL","Location"];
      const rows    = results.map(r => [r.full_name||"",r.job_title||"",r.company||"",r.email||"",r.confidence||"",r.linkedin_url||"",r.location||""]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = [{wch:24},{wch:24},{wch:22},{wch:30},{wch:14},{wch:40},{wch:18}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "LinkedIn Export");
      XLSX.writeFile(wb, `reachct_linkedin_${new Date().toISOString().slice(0,10)}.xlsx`);
    });
  };

  const handleCopy = () => {
    if (!results.length) return;
    const headers = ["Full Name","Job Title","Company","Email","Confidence","LinkedIn URL","Location"];
    const rows    = results.map(r => [r.full_name||"",r.job_title||"",r.company||"",r.email||"",r.confidence||"",r.linkedin_url||"",r.location||""]);
    const tsv     = [headers,...rows].map(r=>r.join("\t")).join("\n");
    navigator.clipboard.writeText(tsv).then(()=>alert("Copied!"));
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const confColor = (c) => c==="verified" ? "#16a34a" : c==="catch-all" ? "#ca8a04" : c==="guess"||c==="unverified" ? "#dc2626" : "#999";

  return (
    <>
      <div className="form-area">
        <div className="form-card">
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div className="form-title" style={{ margin:0 }}>Find People on LinkedIn</div>
            <div style={{ display:"flex", gap:4, background:"#f0f0f0", borderRadius:8, padding:3 }}>
              <button onClick={()=>setMode("single")} style={{
                padding:"5px 14px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                fontFamily:"'DM Sans',sans-serif",
                background: mode==="single"?"#fff":"transparent", color: mode==="single"?"#E8005A":"#888",
                boxShadow: mode==="single"?"0 1px 3px rgba(0,0,0,0.1)":"none" }}>Single</button>
              <button onClick={()=>setMode("bulk")} style={{
                padding:"5px 14px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                fontFamily:"'DM Sans',sans-serif",
                background: mode==="bulk"?"#fff":"transparent", color: mode==="bulk"?"#E8005A":"#888",
                boxShadow: mode==="bulk"?"0 1px 3px rgba(0,0,0,0.1)":"none" }}>Bulk</button>
            </div>
          </div>
          <p className="hint" style={{ marginTop:-4, marginBottom:16 }}>
            {mode==="single"
              ? "Search LinkedIn for decision makers. Add a company domain to auto-find & verify their email."
              : "Paste emails, domains, or company names (one per line) — or pull from a Maps database — to find decision makers at each."}
          </p>
          {mode==="single" ? (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <div>
              <label className="field-label">Role / Job Title</label>
              <input className="field-input" value={role} onChange={e=>setRole(e.target.value)}
                placeholder="e.g. HR Manager, Director (comma = OR)"/>
            </div>
            <div>
              <label className="field-label">Company / Keyword</label>
              <input className="field-input" value={company} onChange={e=>setCompany(e.target.value)}
                placeholder="e.g. Kreaset"/>
            </div>
            <div>
              <label className="field-label">Extra Keyword (optional)</label>
              <input className="field-input" value={keyword} onChange={e=>setKeyword(e.target.value)}
                placeholder="e.g. au pair, host family"/>
            </div>
            <div>
              <label className="field-label">Location <span style={{color:"#E8005A"}}>★ Recommended</span></label>
              <input className="field-input" value={location} onChange={e=>setLocation(e.target.value)}
                placeholder="e.g. Barcelona — improves profile accuracy"/>
            </div>
            <div>
              <label className="field-label">Company Domain (for email finding)</label>
              <input className="field-input" value={domain} onChange={e=>setDomain(e.target.value)}
                placeholder="e.g. kreaset.com"/>
            </div>
            <div>
              <label className="field-label">Max Results</label>
              <input className="field-input" type="number" min="1" max="30" value={maxResults}
                onChange={e=>{ const v=e.target.value; setMaxResults(v===""?"":Math.min(Number(v),30)); }}
                onBlur={e=>{ if(e.target.value==="") setMaxResults(15); }}/>
            </div>
          </div>
          ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:16, marginBottom:16 }}>
            <div>
              <label className="field-label">Paste emails, domains, or company names (one per line)</label>
              <textarea className="field-input" rows={6} value={bulkText} onChange={e=>setBulkText(e.target.value)}
                placeholder={"info@kreaset.com\noptimoclick.com\nThe Agency"}
                style={{ resize:"vertical", fontFamily:"monospace", lineHeight:1.5 }}/>
            </div>
            <div style={{ textAlign:"center", fontSize:12, color:"#999" }}>— or —</div>
            <div>
              <label className="field-label">Pull companies from a Maps database</label>
              <select className="field-select" value={bulkDbId} onChange={e=>setBulkDbId(e.target.value)}>
                <option value={0}>None — use pasted list above</option>
                {mapsDatabases.map(db => <option key={db.id} value={db.id}>{db.name}</option>)}
              </select>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              <div>
                <label className="field-label">Role filter (applied to all)</label>
                <input className="field-input" value={role} onChange={e=>setRole(e.target.value)}
                  placeholder="e.g. HR, Director"/>
              </div>
              <div>
                <label className="field-label">Location (optional)</label>
                <input className="field-input" value={location} onChange={e=>setLocation(e.target.value)}
                  placeholder="e.g. Spain"/>
              </div>
              <div>
                <label className="field-label">Max per company</label>
                <input className="field-input" type="number" min="1" max="10" value={maxPerCompany}
                  onChange={e=>{ const v=e.target.value; setMaxPerCompany(v===""?"":Math.min(Number(v),10)); }}
                  onBlur={e=>{ if(e.target.value==="") setMaxPerCompany(5); }}/>
              </div>
            </div>
          </div>
          )}
          <p className="hint">
            {mode==="single"
              ? "💡 LinkedIn searches are free-range — search any role, company, or keyword combination."
              : "💡 Bulk mode auto-detects each line. Domains are extracted from emails for email finding."}
          </p>
          <div className="btn-row">
            <button className="btn-primary" onClick={mode==="single"?handleSearch:handleBulkSearch} disabled={loading}>
              <SearchIcon/>{loading?"Searching…":(mode==="single"?"Search LinkedIn":"Run Bulk Search")}
            </button>
          </div>
          {error && <div className="error-msg">{error}</div>}
          {loading && <div className="loading-area"><div className="spinner"/>
            <p className="loading-msg">{loadMsg}</p></div>}
        </div>
      </div>

      {searched && (
        <div className="results-area">
          <div className="results-header">
            <div className="results-count">
              <span>{results.length}</span> people found &nbsp;·&nbsp;
              <span style={{ color:"#E8005A" }}>{results.filter(r=>r.email).length}</span> emails found
            </div>
            <div className="btn-row">
              {user && <button className="btn-primary" onClick={()=>setShowAddDB(true)}>+ Add to Database</button>}
              <button className="btn-secondary" onClick={handleExport}><DownloadIcon/>Export Excel</button>
              <button className="btn-secondary" onClick={handleCopy}><CopyIcon/>Copy Table</button>
            </div>
          </div>

          <div style={{ overflowX:"auto" }}>
            <table className="results-table">
              <thead>
                <tr>
                  <th>Full Name</th><th>Job Title</th><th>Company</th>
                  <th>Email</th><th>Confidence</th><th>LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.full_name}</td>
                    <td>{r.job_title}</td>
                    <td>{r.company}</td>
                    <td style={{ color: r.email ? "#E8005A" : "#ccc" }}>{r.email||"—"}</td>
                    <td><span style={{ color:confColor(r.confidence), fontSize:12, fontWeight:600 }}>
                      {r.confidence||"—"}</span></td>
                    <td>{r.linkedin_url
                      ? <a href={r.linkedin_url} target="_blank" rel="noreferrer" style={{ color:"#0a66c2" }}>Profile →</a>
                      : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddDB && (
        <AddToDBModal
          dbKind="linkedin"
          rows={results.map(r=>({ full_name:r.full_name||"", job_title:r.job_title||"", company:r.company||"",
            email:r.email||"", linkedin_url:r.linkedin_url||"", location:r.location||"" }))}
          onClose={()=>setShowAddDB(false)}
        />
      )}
    </>
  );
}