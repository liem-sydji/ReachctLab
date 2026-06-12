import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { API, COMPANY_TYPES_GROUPED } from "../styles.js";
import { SearchIcon, DownloadIcon, CopyIcon, StopIcon } from "../components/icons.jsx";
import { InnerHeader, ResultsTable } from "../components/shared.jsx";
import AddToDBModal from "../components/AddToDBModal.jsx";

export default function SearchPage() {
  const navigate         = useNavigate();
  const { user, token }  = useAuth();
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
      setLoadMsg("Your search is in progress — this may take a couple of minutes. Come back when it's ready.");
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
            setLoadMsg(`Your search is in queue at position ${jd.queue_position||1} — this might take a while. Your results will be saved automatically.`);
          } else {
            setLoadMsg("Your search is in progress — this may take a couple of minutes. Come back when it's ready.");
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
    window.open(`${API}/api/export?query=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}`, "_blank");
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
    <div className="inner-page">
      <InnerHeader title="New Search" />

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
              {user && (
                <button className="btn-primary" onClick={()=>setShowAddDB(true)}>
                  + Add to Database
                </button>
              )}
              <button className="btn-secondary" onClick={handleExport}><DownloadIcon/>Export Excel</button>
              <button className="btn-secondary" onClick={handleCopy}><CopyIcon/>Copy Table</button>
            </div>
          </div>
          <ResultsTable data={results}/>
        </div>
      )}

      {showAddDB && (
        <AddToDBModal
          rows={results.map(r=>({ name:r.name||"", email:r.email||"", phone:r.phone||"",
            website:r.website||"", city:r.city||"", country:r.country||"", company_type:r.company_type||"" }))}
          onClose={()=>setShowAddDB(false)}
        />
      )}
    </div>
  );
}
