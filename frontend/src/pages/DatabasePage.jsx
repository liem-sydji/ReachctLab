import { useState, useEffect } from "react";
import { API, COMPANY_TYPES_GROUPED } from "../styles.js";
import { DatabaseIcon, DownloadIcon, CopyIcon } from "../components/icons.jsx";
import { InnerHeader, ResultsTable } from "../components/shared.jsx";

export default function DatabasePage() {
  const [dbQuery,   setDbQuery]   = useState("");
  const [dbCity,    setDbCity]    = useState("");
  const [dbCountry, setDbCountry] = useState("");
  const [dbResults, setDbResults] = useState([]);
  const [searched,  setSearched]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [filters,   setFilters]   = useState({ countries: [], cities: {}, company_types: [] });

  useEffect(() => {
    fetch(`${API}/api/filters`).then(r => r.json()).then(setFilters).catch(() => {});
  }, []);

  const safeCountries = filters?.countries || [];
  const safeCities    = filters?.cities    || {};

  const handlePull = async () => {
    if (!dbCity && !dbCountry && !dbQuery) { setError("Please select at least one filter."); return; }
    setError(""); setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dbCity)    params.append("city", dbCity);
      if (dbCountry) params.append("country", dbCountry);
      if (dbQuery)   params.append("query", dbQuery);
      const res  = await fetch(`${API}/api/companies?${params}`);
      const data = await res.json();
      setDbResults(data.companies || []);
      setSearched(true);
    } catch { setError("Failed to load data."); }
    setLoading(false);
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (dbCity)    params.append("city", dbCity);
    if (dbCountry) params.append("country", dbCountry);
    if (dbQuery)   params.append("query", dbQuery);
    window.open(`${API}/api/export?${params}`, "_blank");
  };

  const handleCopy = () => {
    if (!dbResults.length) return;
    const headers = ["Company Name", "Email", "Phone", "Website", "City", "Country", "Company Type"];
    const rows = dbResults.map(r => [r.name||"", r.email||"", r.phone||"", r.website||"", r.city||"", r.country||"", r.company_type||""]);
    const tsv = [headers, ...rows].map(r => r.join("\t")).join("\n");
    navigator.clipboard.writeText(tsv).then(() => alert("Copied! Paste into Google Sheets or Excel."));
  };

  return (
    <div className="inner-page">
      <InnerHeader title="Database" />

      <div className="form-area">
        <div className="form-card">
          <div className="form-title">Pull From Database</div>
          <div className="form-grid">
            <div>
              <label className="field-label">Company Type (optional)</label>
              <select className="field-select" value={dbQuery} onChange={e => setDbQuery(e.target.value)}>
                <option value="">All company types</option>
                {Object.entries(COMPANY_TYPES_GROUPED).map(([letter, types]) => (
                  <optgroup key={letter} label={`── ${letter} ──`}>
                    {types.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Country (optional)</label>
              <select className="field-select" value={dbCountry} onChange={e => { setDbCountry(e.target.value); setDbCity(""); }}>
                <option value="">All countries</option>
                {safeCountries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">City (optional)</label>
              <select className="field-select" value={dbCity} onChange={e => setDbCity(e.target.value)}>
                <option value="">All cities</option>
                {(dbCountry ? (safeCities[dbCountry] || []) : Object.values(safeCities).flat()).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn-primary" onClick={handlePull} disabled={loading}>
              <DatabaseIcon />{loading ? "Loading…" : "Pull Data"}
            </button>
          </div>
          {error && <div className="error-msg">{error}</div>}
          {loading && <div className="loading-area"><div className="spinner" /><p className="loading-msg">Fetching from database…</p></div>}
        </div>
      </div>

      {searched && (
        <div className="results-area">
          <div className="results-header">
            <div className="results-count">
              <span>{dbResults.length}</span> companies found
              &nbsp;·&nbsp;
              <span style={{ color: "#E8005A" }}>{dbResults.filter(r => r.email).length}</span> emails found
            </div>
            <div className="btn-row">
              <button className="btn-secondary" onClick={handleExport}><DownloadIcon />Export Excel</button>
              <button className="btn-secondary" onClick={handleCopy}><CopyIcon />Copy Table</button>
            </div>
          </div>
          <ResultsTable data={dbResults} />
        </div>
      )}
    </div>
  );
}
