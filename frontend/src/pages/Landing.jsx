import { useNavigate } from "react-router-dom";
import { ReachCTLogo, SearchIcon, DatabaseIcon } from "../components/icons.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const DashboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);

export default function Landing() {
  const navigate        = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="landing">
      {/* Auth chip top right */}
      {user ? (
        <div className="landing-user-chip">
          {user.picture && <img className="landing-user-avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />}
          <span className="landing-user-name">{user.name || user.email}</span>
          <button className="landing-user-logout" onClick={logout}>Sign out</button>
        </div>
      ) : (
        <button className="landing-signin-btn" onClick={() => navigate("/login")}>Sign in</button>
      )}

      <div className="landing-logo">
        <ReachCTLogo size={44} />
        <span className="landing-title">Reach<span>CT</span></span>
      </div>
      <p className="landing-tagline">B2B Contact Intelligence — Find companies, extract emails, close deals.</p>

      <div className="landing-cards">
        <div className="landing-card" onClick={() => navigate("/search")}>
          <div className="card-icon"><SearchIcon /></div>
          <div>
            <div className="card-title">Start New Search</div>
            <div className="card-desc">Scrape Google Maps for company contacts in any city</div>
          </div>
        </div>
        <div className="landing-card" onClick={() => navigate("/database")}>
          <div className="card-icon"><DatabaseIcon /></div>
          <div>
            <div className="card-title">Pull From Database</div>
            <div className="card-desc">Query and export previously scraped contacts</div>
          </div>
        </div>
        {user && (
          <div className="landing-card" onClick={() => navigate("/dashboard")}>
            <div className="card-icon"><DashboardIcon /></div>
            <div>
              <div className="card-title">My Dashboard</div>
              <div className="card-desc">Your personal databases and saved contact lists</div>
            </div>
          </div>
        )}
      </div>

      <button className="landing-info-link" onClick={() => navigate("/info")}>
        How to use ReachCT?
      </button>
    </div>
  );
}
