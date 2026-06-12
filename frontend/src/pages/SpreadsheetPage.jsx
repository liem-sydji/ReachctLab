import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { API, COMPANY_TYPES_GROUPED } from "../styles.js";
import { ReachCTLogo, SearchIcon, DatabaseIcon, DownloadIcon, StopIcon } from "../components/icons.jsx";

// ─── Left Panel (shared, dark) ────────────────────────────────────────────────
function LeftPanel({ user, onNav }) {
  return (
    <aside style={{
      width: 220, minHeight: "100vh", background: "#111", borderRight: "1px solid #222",
      display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0,
    }}>
      <div style={{ padding: "0 20px 24px", borderBottom: "1px solid #222" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
          onClick={() => onNav("/")}>
          <ReachCTLogo size={22} />
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: "#fff" }}>
            Reach<span style={{ color: "#E8005A" }}>CT</span>
          </span>
        </div>
      </div>
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          {user?.picture
            ? <img src={user.picture} alt="" referrerPolicy="no-referrer"
                style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid #333" }} />
            : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#E8005A",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'Syne',sans-serif" }}>
                {(user?.name || "?")[0].toUpperCase()}
              </div>
          }
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name || "User"}</div>
            <div style={{ fontSize: 11, color: "#555",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
          </div>
        </div>
        <button onClick={() => onNav("/dashboard")} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(232,0,90,0.12)", border: "1px solid rgba(232,0,90,0.2)",
          borderRadius: 8, padding: "9px 12px", cursor: "pointer",
          color: "#E8005A", fontSize: 13, fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif", width: "100%", textAlign: "left",
        }}>
          <span>🗄️</span> Databases
        </button>
      </div>
    </aside>
  );
}

// ─── Tag Input ────────────────────────────────────────────────────────────────
function TagInput({ placeholder, options, value, onChange }) {
  const [inputVal, setInputVal] = useState("");
  const [open, setOpen]         = useState(false);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(inputVal.toLowerCase()) && !value.includes(o)
  ).slice(0, 8);

  const add = (item) => {
    onChange([...value, item]);
    setInputVal("");
    setOpen(false);
  };

  const remove = (item) => onChange(value.filter(v => v !== item));

  return (
    <div style={{ position: "relative" }}>
      <div style={{
        minHeight: 40, padding: "6px 10px", border: "1.5px solid #e8e8e8",
        borderRadius: 10, background: "#fff", display: "flex", flexWrap: "wrap",
        gap: 6, alignItems: "center", cursor: "text",
      }} onClick={() => setOpen(true)}>
        {value.map(v => (
          <span key={v} style={{
            background: "rgba(232,0,90,0.08)", border: "1px solid rgba(232,0,90,0.2)",
            borderRadius: 6, padding: "2px 8px", fontSize: 12, color: "#E8005A",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {v}
            <button onClick={e => { e.stopPropagation(); remove(v); }} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#E8005A", fontSize: 14, padding: 0, lineHeight: 1,
            }}>×</button>
          </span>
        ))}
        <input
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={value.length === 0 ? placeholder : ""}
          style={{ border: "none", outline: "none", fontSize: 13, flex: 1,
            minWidth: 80, fontFamily: "'DM Sans',sans-serif", background: "transparent" }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "#fff", border: "1px solid #eee", borderRadius: 10,
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)", maxHeight: 200, overflowY: "auto",
          marginTop: 4,
        }}>
          {filtered.map(o => (
            <div key={o} onMouseDown={() => add(o)} style={{
              padding: "9px 14px", fontSize: 13, cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", transition: "background 0.1s",
            }}
              onMouseEnter={e => e.target.style.background = "#f9f9f9"}
              onMouseLeave={e => e.target.style.background = "#fff"}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pull Modal ───────────────────────────────────────────────────────────────
function PullModal({ onClose, onPull, filters }) {
  const [queries,   setQueries]   = useState([]);
  const [cities,    setCities]    = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const allTypes    = Object.values(COMPANY_TYPES_GROUPED).flat();
  const allCountries = filters?.countries || [];
  const allCities   = filters?.cities ? Object.values(filters.cities).flat() : [];

  const handlePull = async () => {
    setLoading(true);
    await onPull({ queries, cities, countries });
    setLoading(false);
    onClose();
  };

  return (
    <ModalWrap onClose={onClose} title="Pull from Database" subtitle="Select filters to import contacts into this database.">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>Company Type</label>
          <TagInput placeholder="e.g. Marketing Agency" options={allTypes} value={queries} onChange={setQueries} />
        </div>
        <div>
          <label style={labelStyle}>Country</label>
          <TagInput placeholder="e.g. Germany" options={allCountries} value={countries} onChange={setCountries} />
        </div>
        <div>
          <label style={labelStyle}>City</label>
          <TagInput placeholder="e.g. Berlin" options={allCities} value={cities} onChange={setCities} />
        </div>
        <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
          Leave filters empty to pull all companies. Multiple values are OR-matched.
        </p>
      </div>
      <ModalFooter onClose={onClose} onConfirm={handlePull} loading={loading} label="Pull Data" />
    </ModalWrap>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onClose, onUpload }) {
  const [file,    setFile]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    const res = await onUpload(file);
    setResult(res);
    setLoading(false);
  };

  return (
    <ModalWrap onClose={onClose} title="Upload Spreadsheet" subtitle="Upload an Excel or CSV file to import contacts.">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{
          border: "2px dashed #e8e8e8", borderRadius: 12, padding: 32,
          textAlign: "center", cursor: "pointer", transition: "all 0.2s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#E8005A"; e.currentTarget.style.background = "rgba(232,0,90,0.02)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#e8e8e8"; e.currentTarget.style.background = "none"; }}
          onClick={() => document.getElementById("file-upload-input").click()}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 4 }}>
            {file ? file.name : "Click to select file"}
          </div>
          <div style={{ fontSize: 12, color: "#999" }}>.xlsx, .xls, .csv supported</div>
          <input id="file-upload-input" type="file" accept=".xlsx,.xls,.csv"
            style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
        </div>
        {result && (
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10,
            padding: "12px 16px", fontSize: 13, color: "#166534" }}>
            ✅ Imported {result.inserted} rows — columns: {result.columns?.join(", ")}
          </div>
        )}
        <p style={{ fontSize: 12, color: "#999" }}>
          Column names will be matched automatically. Missing values are left empty.
          Data is also added to the shared ReachCT database.
        </p>
      </div>
      <ModalFooter onClose={onClose} onConfirm={handleUpload} loading={loading}
        label={result ? "Done" : "Import"} disabled={!file} />
    </ModalWrap>
  );
}

// ─── Search Modal ─────────────────────────────────────────────────────────────
function SearchModal({ onClose, onSearch, token }) {
  const [query,   setQuery]   = useState("");
  const [city,    setCity]    = useState("");
  const [country, setCountry] = useState("");
  const [start,   setStart]   = useState(0);
  const [end,     setEnd]     = useState(25);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [jobId,   setJobId]   = useState(null);
  const pollRef = useRef(null);

  const handleSearch = async () => {
    if (!query || !city || !country) return;
    setLoading(true);
    setLoadMsg("Starting search…");
    try {
      const res  = await fetch(`${API}/api/scrape?query=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&start=${start}&end=${end}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setJobId(data.job_id);
      setLoadMsg("Your search is in progress…");
      pollRef.current = setInterval(async () => {
        const jr = await fetch(`${API}/api/job/${data.job_id}`);
        const jd = await jr.json();
        if (jd.status === "done" || jd.status === "cancelled") {
          clearInterval(pollRef.current);
          setLoading(false);
          await onSearch(jd.results || []);
          onClose();
        } else if (jd.status === "error") {
          clearInterval(pollRef.current);
          setLoading(false);
          setLoadMsg("Search failed — please try again.");
        } else if (jd.queue_position > 0) {
          setLoadMsg(`Queued at position ${jd.queue_position}…`);
        }
      }, 4000);
    } catch { setLoading(false); setLoadMsg("Failed to start search."); }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  return (
    <ModalWrap onClose={onClose} title="New Search" subtitle="Search Google Maps and save results to this database.">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Business Type</label>
          <select className="field-select" value={query} onChange={e => setQuery(e.target.value)}
            style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e8e8e8",
              borderRadius: 10, fontSize: 14, fontFamily: "'DM Sans',sans-serif",
              color: "#111", background: "#fff", outline: "none", appearance: "none" }}>
            <option value="">Select company type…</option>
            {Object.entries(COMPANY_TYPES_GROUPED).map(([letter, types]) => (
              <optgroup key={letter} label={`── ${letter} ──`}>
                {types.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>City</label>
            <input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Berlin" />
          </div>
          <div>
            <label style={labelStyle}>Country</label>
            <input style={inputStyle} value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Germany" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Start</label>
            <input style={inputStyle} type="number" min="0" value={start}
              onChange={e => setStart(Number(e.target.value) || 0)} />
          </div>
          <div>
            <label style={labelStyle}>End (max +50)</label>
            <input style={inputStyle} type="number" min="1" value={end}
              onChange={e => setEnd(Math.min(Number(e.target.value) || 25, (start || 0) + 50))} />
          </div>
        </div>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #eee",
              borderTopColor: "#E8005A", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "#666" }}>{loadMsg}</span>
          </div>
        )}
      </div>
      <ModalFooter onClose={onClose} onConfirm={handleSearch}
        loading={loading} label={loading ? "Searching…" : "Search"}
        disabled={!query || !city || !country || loading} />
    </ModalWrap>
  );
}

// ─── Collaborator Modal ───────────────────────────────────────────────────────
function CollaboratorModal({ onClose, dbId, token }) {
  const [email,   setEmail]   = useState("");
  const [role,    setRole]    = useState("viewer");
  const [collabs, setCollabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState("");

  useEffect(() => { fetchCollabs(); }, []);

  const fetchCollabs = async () => {
    try {
      const res  = await fetch(`${API}/api/databases/${dbId}/collaborators`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCollabs(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  const handleAdd = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/databases/${dbId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const err = await res.json();
        setMsg(err.detail || "Failed to add collaborator");
      } else {
        setEmail(""); setMsg(""); fetchCollabs();
      }
    } catch { setMsg("Failed to add collaborator"); }
    setLoading(false);
  };

  const handleRemove = async (userId) => {
    try {
      await fetch(`${API}/api/databases/${dbId}/collaborators/${userId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      setCollabs(prev => prev.filter(c => c.user_id !== userId));
    } catch { /* ignore */ }
  };

  return (
    <ModalWrap onClose={onClose} title="Share Database" subtitle="Add collaborators by their ReachCT email address.">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={email}
            onChange={e => setEmail(e.target.value)} placeholder="colleague@email.com"
            onKeyDown={e => e.key === "Enter" && handleAdd()} />
          <select value={role} onChange={e => setRole(e.target.value)} style={{
            padding: "10px 12px", border: "1.5px solid #e8e8e8", borderRadius: 10,
            fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#111",
            background: "#fff", outline: "none", cursor: "pointer",
          }}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button onClick={handleAdd} disabled={loading || !email.trim()} style={{
            background: "#E8005A", border: "none", borderRadius: 10, padding: "10px 18px",
            color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif", opacity: email.trim() ? 1 : 0.5,
          }}>Add</button>
        </div>
        {msg && <div style={{ fontSize: 12, color: "#E8005A" }}>{msg}</div>}

        {collabs.length > 0 && (
          <div style={{ borderTop: "1px solid #eee", paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#999", letterSpacing: "0.06em",
              textTransform: "uppercase", marginBottom: 10 }}>Current collaborators</div>
            {collabs.map(c => (
              <div key={c.user_id} style={{ display: "flex", alignItems: "center",
                justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {c.picture
                    ? <img src={c.picture} alt="" referrerPolicy="no-referrer"
                        style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                    : <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#E8005A",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, color: "#fff", fontWeight: 700 }}>
                        {(c.name || c.email || "?")[0].toUpperCase()}
                      </div>
                  }
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{c.name || c.email}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>{c.role}</div>
                  </div>
                </div>
                <button onClick={() => handleRemove(c.user_id)} style={{
                  background: "none", border: "none", color: "#ccc", fontSize: 12,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif", padding: "2px 6px",
                }}
                  onMouseEnter={e => e.target.style.color = "#E8005A"}
                  onMouseLeave={e => e.target.style.color = "#ccc"}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <button onClick={onClose} style={{
          background: "#111", border: "1px solid #e8e8e8", borderRadius: 8,
          padding: "9px 20px", color: "#111", fontSize: 13, cursor: "pointer",
          fontFamily: "'DM Sans',sans-serif",
        }}>Done</button>
      </div>
    </ModalWrap>
  );
}

// ─── Shared modal primitives ──────────────────────────────────────────────────
function ModalWrap({ onClose, title, subtitle, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%",
        maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)", animation: "fadeUp 0.2s ease" }}
        onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800,
          color: "#111", margin: "0 0 4px", letterSpacing: "-0.4px" }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: "#999", marginBottom: 24 }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onConfirm, loading, label, disabled }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
      <button onClick={onClose} style={{
        background: "none", border: "1px solid #e8e8e8", borderRadius: 8,
        padding: "9px 18px", color: "#666", fontSize: 13, cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif",
      }}>Cancel</button>
      <button onClick={onConfirm} disabled={disabled || loading} style={{
        background: "#E8005A", border: "none", borderRadius: 8, padding: "9px 20px",
        color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif", opacity: (disabled || loading) ? 0.5 : 1,
      }}>{loading ? "Loading…" : label}</button>
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#999",
  letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6,
  fontFamily: "'DM Sans',sans-serif",
};

const inputStyle = {
  width: "100%", padding: "10px 14px", border: "1.5px solid #e8e8e8",
  borderRadius: 10, fontSize: 14, fontFamily: "'DM Sans',sans-serif",
  color: "#111", background: "#fff", outline: "none", boxSizing: "border-box",
};

// ─── Three Dots Menu ──────────────────────────────────────────────────────────
function ThreeDotsMenu({ onPull, onUpload, onSearch, onShare }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const options = [
    { label: "Pull from Database", icon: "🗄️", onClick: onPull },
    { label: "Upload Spreadsheet", icon: "📂", onClick: onUpload },
    { label: "Start Search",       icon: "🔍", onClick: onSearch },
    { label: "Share",              icon: "👥", onClick: onShare },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        background: "none", border: "1px solid #e8e8e8", borderRadius: 8,
        width: 36, height: 36, display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "pointer", fontSize: 18, color: "#666",
        transition: "all 0.15s",
      }}
        onMouseEnter={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.borderColor = "#ccc"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "#e8e8e8"; }}>
        ⋯
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, zIndex: 200,
          background: "#fff", border: "1px solid #eee", borderRadius: 12,
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)", minWidth: 200, marginTop: 6,
          overflow: "hidden",
        }}>
          {options.map(opt => (
            <button key={opt.label} onClick={() => { opt.onClick(); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", padding: "11px 16px", background: "none",
              border: "none", cursor: "pointer", fontSize: 13, color: "#333",
              fontFamily: "'DM Sans',sans-serif", transition: "background 0.1s", textAlign: "left",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#f9f9f9"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <span>{opt.icon}</span>{opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Spreadsheet Grid ─────────────────────────────────────────────────────────
function SpreadsheetGrid({ entries, columns, onCellChange, onDeleteRow, onDeleteCol, onAddCol, isViewer }) {
  const [editCell, setEditCell] = useState(null); // {rowIdx, col}
  const [editVal,  setEditVal]  = useState("");
  const [newColName, setNewColName] = useState("");
  const [showAddCol, setShowAddCol] = useState(false);

  const handleCellClick = (rowIdx, col, currentVal) => {
    if (isViewer) return;
    setEditCell({ rowIdx, col });
    setEditVal(currentVal || "");
  };

  const handleCellBlur = () => {
    if (editCell) {
      onCellChange(editCell.rowIdx, editCell.col, editVal);
      setEditCell(null);
    }
  };

  const handleAddCol = () => {
    if (!newColName.trim()) return;
    onAddCol(newColName.trim());
    setNewColName("");
    setShowAddCol(false);
  };

  const COL_WIDTH = 180;
  const ROW_NUM_WIDTH = 40;

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", flex: 1 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13, fontFamily: "'DM Sans',sans-serif", minWidth: "100%" }}>
        <thead>
          <tr>
            {/* Row number header */}
            <th style={{ width: ROW_NUM_WIDTH, minWidth: ROW_NUM_WIDTH, background: "#f8f8f8",
              borderRight: "1px solid #e8e8e8", borderBottom: "2px solid #e8e8e8",
              position: "sticky", top: 0, left: 0, zIndex: 10 }} />

            {/* Column headers */}
            {columns.map(col => (
              <th key={col} style={{
                width: COL_WIDTH, minWidth: COL_WIDTH, maxWidth: COL_WIDTH,
                padding: "10px 12px", background: "#f8f8f8", borderRight: "1px solid #e8e8e8",
                borderBottom: "2px solid #e8e8e8", textAlign: "left", fontWeight: 600,
                color: "#333", fontSize: 12, letterSpacing: "0.02em", position: "sticky",
                top: 0, zIndex: 9, whiteSpace: "nowrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{col}</span>
                  {!isViewer && (
                    <button onClick={() => onDeleteCol(col)} style={{
                      background: "none", border: "none", color: "#ccc", cursor: "pointer",
                      fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0,
                      visibility: "hidden",
                    }}
                      className="col-delete-btn">×</button>
                  )}
                </div>
              </th>
            ))}

            {/* Add column header */}
            {!isViewer && (
              <th style={{ background: "#f8f8f8", borderBottom: "2px solid #e8e8e8",
                position: "sticky", top: 0, zIndex: 9, padding: "10px 12px" }}>
                {showAddCol ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input autoFocus value={newColName} onChange={e => setNewColName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleAddCol(); if (e.key === "Escape") setShowAddCol(false); }}
                      placeholder="Column name" style={{
                        width: 120, padding: "4px 8px", border: "1.5px solid #E8005A",
                        borderRadius: 6, fontSize: 12, outline: "none",
                      }} />
                    <button onClick={handleAddCol} style={{
                      background: "#E8005A", border: "none", borderRadius: 6,
                      padding: "4px 8px", color: "#fff", fontSize: 11, cursor: "pointer",
                    }}>Add</button>
                  </div>
                ) : (
                  <button onClick={() => setShowAddCol(true)} style={{
                    background: "none", border: "1.5px dashed #e8e8e8", borderRadius: 6,
                    padding: "4px 10px", color: "#999", fontSize: 12, cursor: "pointer",
                    fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
                  }}>+ Column</button>
                )}
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} style={{ padding: "60px 20px", textAlign: "center",
                color: "#ccc", fontSize: 14, fontStyle: "italic" }}>
                No data yet — use ⋯ menu to pull, upload, or search.
              </td>
            </tr>
          )}
          {entries.map((entry, rowIdx) => (
            <tr key={entry.id || rowIdx} style={{ borderBottom: "1px solid #f0f0f0" }}
              onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>

              {/* Row number */}
              <td style={{ width: ROW_NUM_WIDTH, minWidth: ROW_NUM_WIDTH, padding: "0 8px",
                background: "#f8f8f8", borderRight: "1px solid #e8e8e8", color: "#bbb",
                fontSize: 11, textAlign: "center", position: "sticky", left: 0,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                height: 36 }}>
                <span>{rowIdx + 1}</span>
                {!isViewer && (
                  <button onClick={() => onDeleteRow(rowIdx, entry.id)} style={{
                    background: "none", border: "none", color: "#ddd", cursor: "pointer",
                    fontSize: 14, padding: 0, lineHeight: 1,
                  }}
                    onMouseEnter={e => e.target.style.color = "#E8005A"}
                    onMouseLeave={e => e.target.style.color = "#ddd"}>×</button>
                )}
              </td>

              {/* Data cells */}
              {columns.map(col => {
                const isEditing = editCell?.rowIdx === rowIdx && editCell?.col === col;
                const val       = entry.data?.[col] || "";
                return (
                  <td key={col} style={{
                    width: COL_WIDTH, minWidth: COL_WIDTH, maxWidth: COL_WIDTH,
                    padding: 0, borderRight: "1px solid #f0f0f0",
                    background: isEditing ? "#fff9fb" : "transparent",
                    outline: isEditing ? "2px solid #E8005A" : "none",
                    cursor: isViewer ? "default" : "text",
                  }}
                    onClick={() => handleCellClick(rowIdx, col, val)}>
                    {isEditing ? (
                      <input autoFocus value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={handleCellBlur}
                        onKeyDown={e => { if (e.key === "Enter") handleCellBlur(); if (e.key === "Escape") setEditCell(null); }}
                        style={{ width: "100%", height: 36, padding: "0 12px",
                          border: "none", outline: "none", fontSize: 13,
                          fontFamily: "'DM Sans',sans-serif", background: "transparent" }} />
                    ) : (
                      <div style={{ padding: "0 12px", height: 36, display: "flex",
                        alignItems: "center", overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: col === "email" ? "#E8005A" : "#333",
                        fontWeight: col === "email" ? 500 : 400 }}>
                        {val || ""}
                      </div>
                    )}
                  </td>
                );
              })}

              {/* Empty add-col cell */}
              {!isViewer && <td style={{ borderRight: "none" }} />}
            </tr>
          ))}
        </tbody>
      </table>

      {/* CSS for column delete button hover */}
      <style>{`
        thead th:hover .col-delete-btn { visibility: visible !important; }
      `}</style>
    </div>
  );
}

// ─── Spreadsheet Page ─────────────────────────────────────────────────────────
export default function SpreadsheetPage() {
  const { dbId }          = useParams();
  const { user, token }   = useAuth();
  const navigate          = useNavigate();
  const [db, setDb]       = useState(null);
  const [entries, setEntries] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [modal, setModal]     = useState(null); // pull | upload | search | share

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    fetchAll();
    fetch(`${API}/api/filters`).then(r => r.json()).then(setFilters).catch(() => {});
  }, [dbId, token]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dbRes, entriesRes] = await Promise.all([
        fetch(`${API}/api/databases`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/databases/${dbId}/entries`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const dbs  = await dbRes.json();
      const rows = await entriesRes.json();
      const found = (Array.isArray(dbs) ? dbs : []).find(d => String(d.id) === String(dbId));
      setDb(found || null);
      setEntries(Array.isArray(rows) ? rows : []);
      // Derive columns from all entries
      const cols = deriveColumns(Array.isArray(rows) ? rows : []);
      setColumns(cols);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const deriveColumns = (rows) => {
    const seen = new Set();
    rows.forEach(r => Object.keys(r.data || {}).forEach(k => seen.add(k)));
    return Array.from(seen);
  };

  const isViewer = db?.role === "viewer";

  // ── Cell edit ──
  const handleCellChange = useCallback(async (rowIdx, col, val) => {
    const entry    = entries[rowIdx];
    const newData  = { ...(entry.data || {}), [col]: val };
    const updated  = await fetch(`${API}/api/databases/${dbId}/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: newData }),
    });
    const row = await updated.json();
    setEntries(prev => prev.map((e, i) => i === rowIdx ? row : e));
  }, [entries, dbId, token]);

  // ── Delete row ──
  const handleDeleteRow = useCallback(async (rowIdx, entryId) => {
    await fetch(`${API}/api/databases/${dbId}/entries/${entryId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    const newEntries = entries.filter((_, i) => i !== rowIdx);
    setEntries(newEntries);
    setColumns(deriveColumns(newEntries));
  }, [entries, dbId, token]);

  // ── Delete column ──
  const handleDeleteCol = useCallback(async (col) => {
    if (!confirm(`Delete column "${col}"? This removes it from all rows.`)) return;
    const updated = await Promise.all(entries.map(async entry => {
      const newData = { ...(entry.data || {}) };
      delete newData[col];
      const res = await fetch(`${API}/api/databases/${dbId}/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: newData }),
      });
      return res.json();
    }));
    setEntries(updated);
    setColumns(prev => prev.filter(c => c !== col));
  }, [entries, dbId, token]);

  // ── Add column ──
  const handleAddCol = useCallback((colName) => {
    if (columns.includes(colName)) return;
    setColumns(prev => [...prev, colName]);
  }, [columns]);

  // ── Pull from DB ──
  const handlePull = async ({ queries, cities, countries }) => {
    const res  = await fetch(`${API}/api/databases/${dbId}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ queries, cities, countries }),
    });
    const data = await res.json();
    if (data.columns) {
      setColumns(prev => {
        const merged = [...new Set([...prev, ...data.columns])];
        return merged;
      });
    }
    fetchAll();
  };

  // ── Upload ──
  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res  = await fetch(`${API}/api/databases/${dbId}/upload`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData,
    });
    const data = await res.json();
    if (data.columns) {
      setColumns(prev => [...new Set([...prev, ...data.columns])]);
    }
    fetchAll();
    return data;
  };

  // ── Save search results ──
  const handleSearch = async (results) => {
    if (!results.length) return;
    const rows = results.map(r => ({
      name: r.name || "", email: r.email || "", phone: r.phone || "",
      website: r.website || "", city: r.city || "", country: r.country || "",
      company_type: r.company_type || "",
    }));
    const res = await fetch(`${API}/api/databases/${dbId}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rows }),
    });
    const cols = ["name","email","phone","website","city","country","company_type"];
    setColumns(prev => [...new Set([...prev, ...cols])]);
    fetchAll();
  };

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0a0a", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #333",
        borderTopColor: "#E8005A", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f8f8f8", overflow: "hidden" }}>
      <LeftPanel user={user} onNav={navigate} />

      {/* Spreadsheet area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ background: "#fff", borderBottom: "1px solid #eee", padding: "0 24px",
          height: 56, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <button onClick={() => navigate("/dashboard")} style={{
            background: "none", border: "none", color: "#999", cursor: "pointer",
            fontSize: 13, fontFamily: "'DM Sans',sans-serif", display: "flex",
            alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6,
            transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.color = "#333"; e.currentTarget.style.background = "#f5f5f5"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#999"; e.currentTarget.style.background = "none"; }}>
            ← Databases
          </button>
          <div style={{ width: 1, height: 20, background: "#eee" }} />
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700,
            color: "#111", margin: 0, flex: 1 }}>{db?.name || "Database"}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#bbb" }}>
              {entries.length} row{entries.length !== 1 ? "s" : ""}
            </span>
            {!isViewer && (
              <ThreeDotsMenu
                onPull={() => setModal("pull")}
                onUpload={() => setModal("upload")}
                onSearch={() => setModal("search")}
                onShare={() => setModal("share")}
              />
            )}
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <SpreadsheetGrid
            entries={entries}
            columns={columns}
            onCellChange={handleCellChange}
            onDeleteRow={handleDeleteRow}
            onDeleteCol={handleDeleteCol}
            onAddCol={handleAddCol}
            isViewer={isViewer}
          />
        </div>
      </div>

      {/* Modals */}
      {modal === "pull"   && <PullModal   onClose={() => setModal(null)} onPull={handlePull} filters={filters} />}
      {modal === "upload" && <UploadModal onClose={() => setModal(null)} onUpload={handleUpload} />}
      {modal === "search" && <SearchModal onClose={() => setModal(null)} onSearch={handleSearch} token={token} />}
      {modal === "share"  && <CollaboratorModal onClose={() => setModal(null)} dbId={dbId} token={token} />}
    </div>
  );
}
