import { useNavigate } from "react-router-dom";
import { ReachCTLogo, SearchIcon, DatabaseIcon } from "../components/icons.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Landing() {
  const navigate        = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="landing">
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
      </div>

      <button className="landing-info-link" onClick={() => navigate("/info")}>
        How to use ReachCT?
      </button>
    </div>
  );
}
