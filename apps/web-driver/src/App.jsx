import { useEffect, useState, useCallback } from "react";
import {
  login, fetchMe, registerUser, registerDriver,
  listAvailableTrips, getActiveTrip,
  acceptTrip, startTrip, completeTrip,
  listAvailableAssistance, getActiveAssistance,
  acceptAssistance, startAssistance, resolveAssistance,
  getMyRating, getMyEarnings,
  getMyVehicle, registerVehicle,
  getDriverProfile, setDriverOnline, listDriverTripHistory,
  createPayoutRequest, listPayoutRequests,
  submitDocument, listMyDocuments,
  listNotifications, getUnreadCount, markAllRead,
  listCategories,
  updateDriverLocation, getDriverLocation,
} from "./api";
import { firebaseEnabled, signInWithGoogle, firebaseSignOut } from "./auth";

const REQUIRED_ROLE = "driver";
const TOKEN_KEY = "ziza_token";
const POLL_MS = 5000;

// Sprint 21 — vehicle category constants
const VEHICLE_CATEGORIES = [
  { value: "economy", label: "🚗 Économique" },
  { value: "comfort", label: "🚙 Confort" },
  { value: "premium", label: "🏎️ Premium" },
];

// Sprint 22 — Abidjan landmarks for location quick-pick
const ABIDJAN_LOCATIONS = {
  "Plateau (Centre-ville)": { lat: 5.3207, lng: -4.0175 },
  "Cocody":                 { lat: 5.3600, lng: -3.9801 },
  "Yopougon":               { lat: 5.3386, lng: -4.0721 },
  "Abobo":                  { lat: 5.4154, lng: -4.0243 },
  "Marcory":                { lat: 5.2997, lng: -3.9904 },
  "Treichville":            { lat: 5.2975, lng: -4.0119 },
  "Adjamé":                 { lat: 5.3612, lng: -4.0288 },
  "Aéroport (Port-Bouët)":  { lat: 5.2537, lng: -3.9268 },
};
const LOCATION_NAMES = Object.keys(ABIDJAN_LOCATIONS);

const STATUS_LABELS = {
  accepted:    "✓ Course acceptée — en route vers le client",
  in_progress: "🚗 Course en cours",
  completed:   "✅ Course terminée",
  cancelled:   "✗ Course annulée par le client",
};

const ASSISTANCE_TYPE_LABELS = {
  breakdown: "🔧 Panne mécanique",
  flat_tyre: "🔴 Pneu crevé",
  tow:       "🚛 Remorquage",
  fuel:      "⛽ Carburant",
  lockout:   "🔑 Clés perdues",
};

const ASSISTANCE_STATUS_LABELS = {
  accepted:    "✓ Intervention acceptée — en route",
  in_progress: "🔧 Intervention en cours",
  resolved:    "✅ Intervention terminée",
  cancelled:   "✗ Annulée par le client",
};

function formatXOF(n) {
  return new Intl.NumberFormat("fr-FR").format(n) + " XOF";
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onEmailLogin, onGoogleLogin, error, loading }) {
  const [email, setEmail] = useState("driver@ziza.dev");
  const [password, setPassword] = useState("ziza2024");
  return (
    <div className="app">
      <h1>Ziza Driver</h1>
      <p className="subtitle">Sprint 22 — Localisation chauffeur & ETA</p>
      <form className="login-form" onSubmit={(e) => { e.preventDefault(); onEmailLogin(email, password); }}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" required />
        <button type="submit" disabled={loading}>{loading ? "Connexion…" : "Se connecter"}</button>
      </form>
      {firebaseEnabled && (
        <button className="google-btn" onClick={onGoogleLogin} disabled={loading}>
          <span>G</span> Continuer avec Google
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
      <p className="hint">Dev: driver@ziza.dev / ziza2024</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active trip card — shown when driver has an ongoing ride
// ---------------------------------------------------------------------------

function ActiveTripCard({ token, trip, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleAction(fn) {
    setBusy(true); setError(null);
    try { const updated = await fn(token, trip.trip_id); onUpdate(updated); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className={`active-trip-card active-${trip.status}`}>
      <div className="active-status">{STATUS_LABELS[trip.status] ?? trip.status}</div>
      {trip.fare_xof && <div className="active-fare">{formatXOF(trip.fare_xof)}</div>}
      <div className="fare-meta">
        {trip.distance_km != null && <span>🛣️ {trip.distance_km.toFixed(1)} km</span>}
        {trip.duration_min != null && <span>⏱️ ~{trip.duration_min} min</span>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {trip.status === "accepted" && (
        <button className="action-btn start-btn" onClick={() => handleAction(startTrip)} disabled={busy}>
          {busy ? "…" : "🚦 Démarrer la course"}
        </button>
      )}
      {trip.status === "in_progress" && (
        <button className="action-btn complete-btn" onClick={() => handleAction(completeTrip)} disabled={busy}>
          {busy ? "…" : "🏁 Terminer la course"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver rating stats card
// ---------------------------------------------------------------------------

function RatingStats({ stats }) {
  if (!stats) return null;
  const { average_stars, total_ratings } = stats;

  function renderStars(avg) {
    if (avg === null) return null;
    return [1, 2, 3, 4, 5].map((n) => (
      <span key={n} className={`stat-star ${n <= Math.round(avg) ? "filled" : ""}`}>★</span>
    ));
  }

  return (
    <div className="rating-stats-card">
      <div className="rating-stats-label">Ma note</div>
      {total_ratings === 0 ? (
        <div className="rating-stats-empty">Aucune évaluation pour l'instant</div>
      ) : (
        <>
          <div className="rating-stars-row">{renderStars(average_stars)}</div>
          <div className="rating-avg">
            {average_stars !== null ? average_stars.toFixed(1) : "—"}
            <span className="rating-count"> / 5 · {total_ratings} avis</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Earnings card — Sprint 11
// ---------------------------------------------------------------------------

function EarningsCard({ earnings }) {
  if (!earnings) return null;
  const { total_xof, total_trips, today_xof, today_trips, week_xof, week_trips, recent_trips = [] } = earnings;

  return (
    <div className="earnings-card">
      <div className="earnings-label">Mes gains</div>
      <div className="earnings-total">{formatXOF(total_xof)}</div>
      <div className="earnings-count">{total_trips} course{total_trips !== 1 ? "s" : ""} complétée{total_trips !== 1 ? "s" : ""}</div>
      <div className="earnings-periods">
        <div className="earnings-period">
          <span className="period-label">Aujourd'hui</span>
          <span className="period-value">{formatXOF(today_xof)}</span>
          <span className="period-trips">{today_trips} course{today_trips !== 1 ? "s" : ""}</span>
        </div>
        <div className="earnings-period">
          <span className="period-label">Cette semaine</span>
          <span className="period-value">{formatXOF(week_xof)}</span>
          <span className="period-trips">{week_trips} course{week_trips !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Sprint 11 fix: recent trips list */}
      {recent_trips.length > 0 && (
        <div className="earnings-recent">
          <div className="earnings-recent-title">10 dernières courses</div>
          <div className="earnings-recent-list">
            {recent_trips.map((t) => (
              <div key={t.trip_id} className="earnings-recent-row">
                <div className="earnings-recent-left">
                  <span className="earnings-recent-fare">
                    {t.fare_xof != null ? formatXOF(t.fare_xof) : "—"}
                  </span>
                  <span className="earnings-recent-meta">
                    {t.distance_km != null && `🛣️ ${t.distance_km.toFixed(1)} km`}
                    {t.duration_min != null && ` · ⏱️ ${t.duration_min} min`}
                  </span>
                </div>
                <span className="earnings-recent-date">
                  {new Date(t.completed_at).toLocaleDateString("fr-FR", {
                    day: "2-digit", month: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {recent_trips.length === 0 && total_trips === 0 && (
        <p className="earnings-empty">Aucune course complétée pour l&apos;instant.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vehicle card — Sprint 12
// ---------------------------------------------------------------------------

function VehicleCard({ token, vehicle, onSaved }) {
  const [editing, setEditing] = useState(!vehicle);
  const [plate, setPlate]       = useState(vehicle?.plate ?? "");
  const [make, setMake]         = useState(vehicle?.make ?? "");
  const [model, setModel]       = useState(vehicle?.model ?? "");
  const [year, setYear]         = useState(vehicle?.year ?? "");
  const [color, setColor]       = useState(vehicle?.color ?? "");
  const [category, setCategory] = useState(vehicle?.category ?? "economy"); // Sprint 21
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const v = await registerVehicle(
        token, plate.trim(), make.trim() || null, model.trim() || null,
        year || null, color.trim() || null, category,
      );
      onSaved(v);
      setEditing(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  const categoryLabel = VEHICLE_CATEGORIES.find((c) => c.value === (vehicle?.category ?? "economy"))?.label ?? "🚗 Économique";

  if (!editing && vehicle) {
    return (
      <div className="vehicle-card">
        <div className="vehicle-label">Mon véhicule</div>
        <div className="vehicle-plate">{vehicle.plate}</div>
        <div className="vehicle-meta">
          {[vehicle.color, vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" · ")}
        </div>
        <div className="vehicle-category-badge">{categoryLabel}</div>
        <button className="vehicle-edit-btn" onClick={() => setEditing(true)}>Modifier</button>
      </div>
    );
  }

  return (
    <div className="vehicle-card vehicle-card-form">
      <div className="vehicle-label">{vehicle ? "Modifier le véhicule" : "Enregistrer mon véhicule"}</div>
      <form className="vehicle-form" onSubmit={handleSave}>
        <input className="vehicle-input" placeholder="Plaque *" value={plate} onChange={(e) => setPlate(e.target.value)} required />
        <div className="vehicle-row">
          <input className="vehicle-input" placeholder="Marque" value={make}  onChange={(e) => setMake(e.target.value)} />
          <input className="vehicle-input" placeholder="Modèle" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="vehicle-row">
          <input className="vehicle-input" placeholder="Année" type="number" min="1980" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
          <input className="vehicle-input" placeholder="Couleur" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        {/* Sprint 21: category selector */}
        <div className="vehicle-category-row">
          <span className="vehicle-category-label">Catégorie</span>
          <div className="vehicle-category-btns">
            {VEHICLE_CATEGORIES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`vehicle-cat-btn ${category === value ? "vehicle-cat-btn-selected" : ""}`}
                onClick={() => setCategory(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="vehicle-form-actions">
          <button type="submit" className="action-btn accept-btn" disabled={saving}>{saving ? "…" : "✓ Enregistrer"}</button>
          {vehicle && <button type="button" className="logout-btn" onClick={() => setEditing(false)}>Annuler</button>}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active assistance card — shown when driver has an ongoing intervention
// ---------------------------------------------------------------------------

function ActiveAssistanceCard({ token, request, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleAction(fn) {
    setBusy(true); setError(null);
    try { const updated = await fn(token, request.request_id); onUpdate(updated); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const typeLabel = ASSISTANCE_TYPE_LABELS[request.type] ?? request.type;

  return (
    <div className={`active-trip-card active-${request.status}`}>
      <div className="assist-type-chip">{typeLabel}</div>
      <div className="active-status">{ASSISTANCE_STATUS_LABELS[request.status] ?? request.status}</div>
      {request.note && <p className="assist-note">{request.note}</p>}
      {error && <p className="form-error">{error}</p>}
      {request.status === "accepted" && (
        <button className="action-btn start-btn" onClick={() => handleAction(startAssistance)} disabled={busy}>
          {busy ? "…" : "🔧 Démarrer l'intervention"}
        </button>
      )}
      {request.status === "in_progress" && (
        <button className="action-btn complete-btn" onClick={() => handleAction(resolveAssistance)} disabled={busy}>
          {busy ? "…" : "✅ Terminer l'intervention"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified dispatch list — pending trips + assistance requests
// ---------------------------------------------------------------------------

function AvailableTripsSection({ token, onTripAccepted, onAssistanceAccepted }) {
  const [trips, setTrips] = useState([]);
  const [assistance, setAssistance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, a] = await Promise.all([
        listAvailableTrips(token),
        listAvailableAssistance(token),
      ]);
      setTrips(t);
      setAssistance(a);
    } catch (_) { /* silent */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleAcceptTrip(tripId) {
    setAccepting(tripId); setError(null);
    try { onTripAccepted(await acceptTrip(token, tripId)); }
    catch (e) { setError(e.message); setAccepting(null); }
  }

  async function handleAcceptAssistance(reqId) {
    setAccepting(reqId); setError(null);
    try { onAssistanceAccepted(await acceptAssistance(token, reqId)); }
    catch (e) { setError(e.message); setAccepting(null); }
  }

  const totalItems = trips.length + assistance.length;

  return (
    <div className="available-section">
      <div className="available-header">
        <h2 className="section-title">Dispatch</h2>
        <span className="live-badge">● Live</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && totalItems === 0 && (
        <div className="status loading">⏳ Chargement…</div>
      )}
      {!loading && totalItems === 0 && (
        <div className="empty-state">Aucune mission disponible pour le moment.</div>
      )}
      <div className="trip-list">
        {trips.map((t) => (
          <div key={t.trip_id} className="trip-card">
            <div className="dispatch-tag tag-ride">🚕 Trajet</div>
            {t.category && t.category !== "economy" && (
              <div className={`dispatch-category dispatch-cat-${t.category}`}>
                {VEHICLE_CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category}
              </div>
            )}
            <div className="trip-card-fare">{t.fare_xof ? formatXOF(t.fare_xof) : "—"}</div>
            <div className="trip-card-meta">
              {t.distance_km != null && <span>🛣️ {t.distance_km.toFixed(1)} km</span>}
              {t.duration_min != null && <span>⏱️ ~{t.duration_min} min</span>}
            </div>
            <button
              className="action-btn accept-btn"
              onClick={() => handleAcceptTrip(t.trip_id)}
              disabled={accepting === t.trip_id}
            >
              {accepting === t.trip_id ? "Acceptation…" : "✓ Accepter"}
            </button>
          </div>
        ))}
        {assistance.map((a) => (
          <div key={a.request_id} className="trip-card assist-card">
            <div className="dispatch-tag tag-assist">🆘 Assistance</div>
            <div className="trip-card-fare assist-type">
              {ASSISTANCE_TYPE_LABELS[a.type] ?? a.type}
            </div>
            {a.note && <div className="trip-card-meta"><span>{a.note}</span></div>}
            <button
              className="action-btn accept-btn"
              onClick={() => handleAcceptAssistance(a.request_id)}
              disabled={accepting === a.request_id}
            >
              {accepting === a.request_id ? "Acceptation…" : "✓ Accepter"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver trip history — Sprint 13
// ---------------------------------------------------------------------------

const TRIP_HISTORY_PAGE = 10;

function DriverTripHistory({ token }) {
  const [trips, setTrips] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (p = 0) => {
    setLoading(true); setError(null);
    try {
      const data = await listDriverTripHistory(token, TRIP_HISTORY_PAGE, p * TRIP_HISTORY_PAGE);
      setTrips(data);
      setPage(p);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  if (loading && trips.length === 0) return <div className="status loading">⏳ Chargement…</div>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <div className="driver-history">
      <div className="available-header">
        <h2 className="section-title">Mes courses terminées</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>
      {trips.length === 0 && (
        <div className="empty-state">Aucune course terminée pour le moment.</div>
      )}
      <div className="trip-list">
        {trips.map((t) => (
          <div key={t.trip_id} className={`trip-card history-trip-${t.status}`}>
            <div className={`dispatch-tag ${t.status === "completed" ? "tag-ride" : "tag-cancelled"}`}>
              {t.status === "completed" ? "✅ Terminée" : "✗ Annulée"}
            </div>
            {t.fare_xof && <div className="trip-card-fare">{formatXOF(t.fare_xof)}</div>}
            <div className="trip-card-meta">
              {t.distance_km != null && <span>🛣️ {t.distance_km.toFixed(1)} km</span>}
              {t.duration_min != null && <span>⏱️ {t.duration_min} min</span>}
              <span>{new Date(t.updated_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
            </div>
          </div>
        ))}
      </div>
      {(trips.length === TRIP_HISTORY_PAGE || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={trips.length < TRIP_HISTORY_PAGE || loading}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payout Section — Sprint 15
// ---------------------------------------------------------------------------

const PAYOUT_STATUS_LABELS = {
  pending:  "⏳ En attente",
  approved: "✅ Approuvé",
  rejected: "✗ Rejeté",
};

function PayoutSection({ token }) {
  const [amount, setAmount]   = useState("");
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    listPayoutRequests(token)
      .then(setPayouts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      await createPayoutRequest(token, Number(amount));
      setAmount("");
      setSuccess("Demande envoyée avec succès !");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="payout-section">
      <h3 className="section-title">💰 Demandes de retrait</h3>

      <form className="payout-form" onSubmit={handleSubmit}>
        <input
          className="payout-amount-input"
          type="number"
          min="1"
          step="500"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Montant en XOF (ex: 50000)"
          required
        />
        <button className="payout-submit-btn" type="submit" disabled={submitting}>
          {submitting ? "Envoi…" : "Demander le retrait"}
        </button>
      </form>
      {success && <p className="payout-success">{success}</p>}
      {error   && <p className="payout-err">{error}</p>}

      <div className="payout-list">
        {loading && <p className="loading-msg">Chargement…</p>}
        {!loading && payouts.length === 0 && (
          <p className="payout-empty">Aucune demande de retrait pour l&apos;instant.</p>
        )}
        {payouts.map((p) => (
          <div key={p.payout_id} className={`payout-item payout-${p.status}`}>
            <div className="payout-item-main">
              <span className="payout-amount">{formatXOF(p.amount_xof)}</span>
              <span className={`payout-status payout-status-${p.status}`}>
                {PAYOUT_STATUS_LABELS[p.status] ?? p.status}
              </span>
            </div>
            {p.note_admin && (
              <p className="payout-note">💬 {p.note_admin}</p>
            )}
            <p className="payout-date">
              {new Date(p.created_at).toLocaleDateString("fr-FR", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents section — Sprint 17
// ---------------------------------------------------------------------------

const DOCUMENT_TYPE_LABELS = {
  license:      "🪪 Permis de conduire",
  insurance:    "🛡️ Assurance véhicule",
  registration: "📋 Carte grise",
  id_card:      "🪪 Pièce d'identité",
};

const DOCUMENT_STATUS_LABELS = {
  pending:  "⏳ En attente",
  approved: "✅ Approuvé",
  rejected: "✗ Rejeté",
};

const DOCUMENT_TYPES = ["license", "insurance", "registration", "id_card"];

function DocumentsSection({ token }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState("license");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  const loadDocs = useCallback(() => {
    setLoading(true);
    listMyDocuments(token)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim()) { setError("L'URL du document est requise."); return; }
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      await submitDocument(token, docType, url.trim());
      setUrl("");
      setSuccess("✓ Document soumis pour vérification.");
      loadDocs();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="documents-section">
      <h3 className="doc-title">📄 Mes documents KYC</h3>
      <form className="doc-form" onSubmit={handleSubmit}>
        <select
          className="doc-type-select"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
        >
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <input
          className="doc-url-input"
          type="url"
          placeholder="URL du document (lien de stockage)"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          maxLength={2048}
        />
        {success && <p className="doc-success">{success}</p>}
        {error   && <p className="doc-err">{error}</p>}
        <button type="submit" className="doc-submit-btn" disabled={submitting}>
          {submitting ? "Envoi…" : "📤 Soumettre le document"}
        </button>
      </form>

      <div className="doc-list">
        {loading && <p className="loading-msg">Chargement…</p>}
        {!loading && docs.length === 0 && (
          <p className="doc-empty">Aucun document soumis pour l&apos;instant.</p>
        )}
        {docs.map((d) => (
          <div key={d.document_id} className={`doc-item doc-${d.status}`}>
            <div className="doc-item-main">
              <span className="doc-type">{DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</span>
              <span className={`doc-status doc-status-${d.status}`}>
                {DOCUMENT_STATUS_LABELS[d.status] ?? d.status}
              </span>
            </div>
            {d.note_admin && <p className="doc-note">💬 {d.note_admin}</p>}
            <p className="doc-date">
              {new Date(d.created_at).toLocaleDateString("fr-FR", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications section — Sprint 18
// ---------------------------------------------------------------------------

const DRIVER_NOTIF_ICONS = {
  document_approved: "✅",
  document_rejected: "❌",
  trip_accepted:     "🚗",
  trip_completed:    "✅",
};

const DRIVER_NOTIF_PAGE = 10;

function DriverNotificationsSection({ token, onRead }) {
  const [notifs, setNotifs] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const data = await listNotifications(token, DRIVER_NOTIF_PAGE, p * DRIVER_NOTIF_PAGE);
      setNotifs(data); setPage(p);
    } catch (_) {}
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  async function handleMarkAll() {
    setMarking(true);
    try {
      await markAllRead(token);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
      onRead();
    } catch (_) {}
    finally { setMarking(false); }
  }

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <div className="notif-section">
      <div className="notif-header">
        <h3 className="section-title">🔔 Notifications</h3>
        {unreadCount > 0 && (
          <button className="notif-mark-btn" onClick={handleMarkAll} disabled={marking}>
            {marking ? "…" : `Tout marquer lu (${unreadCount})`}
          </button>
        )}
      </div>
      {loading && <p className="muted">⏳ Chargement…</p>}
      {!loading && notifs.length === 0 && <p className="muted">Aucune notification.</p>}
      <div className="notif-list">
        {notifs.map((n) => (
          <div key={n.notification_id} className={`notif-item ${n.read ? "notif-read" : "notif-unread"}`}>
            <div className="notif-item-header">
              <span className="notif-icon">{DRIVER_NOTIF_ICONS[n.type] ?? "🔔"}</span>
              <span className="notif-title">{n.title}</span>
              {!n.read && <span className="notif-dot" />}
            </div>
            <p className="notif-body">{n.body}</p>
            <span className="notif-date">
              {new Date(n.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
        ))}
      </div>
      {(notifs.length === DRIVER_NOTIF_PAGE || page > 0) && (
        <div className="history-pagination">
          <button className="page-btn-sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info-sm">Page {page + 1}</span>
          <button className="page-btn-sm" onClick={() => load(page + 1)} disabled={notifs.length < DRIVER_NOTIF_PAGE || loading}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver location section — Sprint 22
// ---------------------------------------------------------------------------

function LocationSection({ token }) {
  const [landmark, setLandmark] = useState(LOCATION_NAMES[0]);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [useGps, setUseGps] = useState(false);
  const [current, setCurrent] = useState(null); // { lat, lng, updated_at }
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Load current location on mount
  useEffect(() => {
    getDriverLocation(token).then(setCurrent).catch(() => {});
  }, [token]);

  async function push(lat, lng) {
    setPushing(true); setError(null); setSuccess(false);
    try {
      const loc = await updateDriverLocation(token, lat, lng);
      setCurrent(loc);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) { setError(e.message); }
    finally { setPushing(false); }
  }

  function handleLandmark(e) {
    setLandmark(e.target.value);
    setManualLat(""); setManualLng("");
  }

  async function handlePushLandmark() {
    const c = ABIDJAN_LOCATIONS[landmark];
    await push(c.lat, c.lng);
  }

  async function handlePushManual(e) {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) { setError("Coordonnées invalides"); return; }
    await push(lat, lng);
  }

  async function handleGps() {
    if (!navigator.geolocation) { setError("Géolocalisation non disponible"); return; }
    setUseGps(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        await push(coords.latitude, coords.longitude);
        setUseGps(false);
      },
      () => { setError("Impossible d'obtenir la position GPS"); setUseGps(false); },
      { timeout: 10000 },
    );
  }

  return (
    <div className="location-section">
      <h3 className="section-title">📍 Ma position</h3>

      {current && (
        <div className="location-current">
          <span className="location-current-dot">●</span>
          <span>{current.lat.toFixed(4)}, {current.lng.toFixed(4)}</span>
          <span className="location-current-time">
            {new Date(current.updated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}
      {!current && <p className="muted">Aucune position enregistrée.</p>}

      {/* Quick-pick from Abidjan landmarks */}
      <div className="location-row">
        <select
          className="location-select"
          value={landmark}
          onChange={handleLandmark}
        >
          {LOCATION_NAMES.map((n) => <option key={n}>{n}</option>)}
        </select>
        <button
          className="location-push-btn"
          onClick={handlePushLandmark}
          disabled={pushing}
        >
          {pushing ? "…" : "📍 Mettre à jour"}
        </button>
      </div>

      {/* GPS button */}
      <button
        className="location-gps-btn"
        onClick={handleGps}
        disabled={pushing || useGps}
      >
        {useGps ? "⏳ Acquisition GPS…" : "🛰️ Utiliser ma position GPS"}
      </button>

      {/* Manual coordinates (advanced) */}
      <details className="location-manual">
        <summary className="location-manual-toggle">Coordonnées manuelles</summary>
        <form className="location-manual-form" onSubmit={handlePushManual}>
          <input
            className="location-coord-input"
            type="number" step="0.0001" placeholder="Latitude"
            value={manualLat} onChange={(e) => setManualLat(e.target.value)}
          />
          <input
            className="location-coord-input"
            type="number" step="0.0001" placeholder="Longitude"
            value={manualLng} onChange={(e) => setManualLng(e.target.value)}
          />
          <button type="submit" className="location-push-btn" disabled={pushing}>
            {pushing ? "…" : "OK"}
          </button>
        </form>
      </details>

      {error   && <p className="form-error" style={{ marginTop: "8px" }}>{error}</p>}
      {success && <p className="location-success">✓ Position mise à jour</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ user, token, onLogout }) {
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeAssistance, setActiveAssistance] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [ratingStats, setRatingStats] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [vehicle, setVehicle] = useState(undefined); // undefined = loading, null = none
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [tab, setTab] = useState("dispatch"); // "dispatch" | "history" | "payouts" | "documents" | "notifications" | "location"
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(() => {
    getUnreadCount(token).then((d) => setUnreadCount(d.count)).catch(() => {});
  }, [token]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);
  useEffect(() => { refreshUnread(); }, [tab, refreshUnread]);

  // On mount: parallel fetch
  useEffect(() => {
    Promise.all([
      getActiveTrip(token).then(({ trip }) => { setActiveTrip(trip); }),
      getActiveAssistance(token).then(({ request }) => { setActiveAssistance(request); }).catch(() => {}),
      getMyRating(token).then(setRatingStats).catch(() => {}),
      getMyEarnings(token).then(setEarnings).catch(() => {}),
      getMyVehicle(token).then(setVehicle).catch(() => setVehicle(null)),
      getDriverProfile(token).then((p) => setIsOnline(p.is_online)).catch(() => {}),
    ]).finally(() => setInitialized(true));
  }, [token]);

  // Poll active trip status every 5s (if active)
  useEffect(() => {
    if (!activeTrip) return;
    if (["completed", "cancelled"].includes(activeTrip.status)) return;
    const id = setInterval(() => {
      getActiveTrip(token)
        .then(({ trip }) => setActiveTrip(trip))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [activeTrip?.trip_id, activeTrip?.status]);

  function refreshStats() {
    getMyRating(token).then(setRatingStats).catch(() => {});
    getMyEarnings(token).then(setEarnings).catch(() => {});
  }

  async function handleToggleOnline() {
    setTogglingOnline(true);
    try {
      const result = await setDriverOnline(token, !isOnline);
      setIsOnline(result.is_online);
    } catch (_) { /* swallow */ }
    finally { setTogglingOnline(false); }
  }

  function handleTripUpdate(updated) {
    setActiveTrip(updated);
    if (["completed", "cancelled"].includes(updated.status)) {
      if (updated.status === "completed") {
        setTimeout(refreshStats, 2000);
      }
      setTimeout(() => setActiveTrip(null), 3000);
    }
  }

  function handleAssistanceUpdate(updated) {
    setActiveAssistance(updated);
    if (["resolved", "cancelled"].includes(updated.status)) {
      setTimeout(() => setActiveAssistance(null), 3000);
    }
  }

  const hasActive = (activeTrip && !["completed", "cancelled"].includes(activeTrip.status))
    || (activeAssistance && !["resolved", "cancelled"].includes(activeAssistance.status));

  if (!initialized) {
    return (
      <div className="app">
        <div className="status loading">⏳ Chargement…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="dash-header">
        <h1>Ziza Driver</h1>
        <div className="dash-header-right">
          <button
            className={`bell-btn ${unreadCount > 0 ? "bell-btn-active" : ""}`}
            onClick={() => setTab("notifications")}
            title="Notifications"
          >
            🔔{unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
          </button>
          <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
        </div>
      </header>
      <div className="status ok">✓ Connecté — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      {/* Online/Offline toggle */}
      <button
        className={`online-toggle ${isOnline ? "online" : "offline"}`}
        onClick={handleToggleOnline}
        disabled={togglingOnline}
      >
        <span className="online-dot" />
        {togglingOnline ? "…" : isOnline ? "En ligne" : "Hors ligne"}
      </button>

      <VehicleCard token={token} vehicle={vehicle} onSaved={setVehicle} />
      <EarningsCard earnings={earnings} />
      <RatingStats stats={ratingStats} />

      {/* Active mission always shown regardless of tab */}
      {hasActive ? (
        activeTrip && !["completed", "cancelled"].includes(activeTrip.status) ? (
          <ActiveTripCard token={token} trip={activeTrip} onUpdate={handleTripUpdate} />
        ) : (
          <ActiveAssistanceCard token={token} request={activeAssistance} onUpdate={handleAssistanceUpdate} />
        )
      ) : (
        <>
          {/* Tabs: Dispatch / Historique */}
          <div className="driver-tabs">
            <button
              className={`driver-tab ${tab === "dispatch" ? "active" : ""}`}
              onClick={() => setTab("dispatch")}
            >
              🚕 Dispatch
            </button>
            <button
              className={`driver-tab ${tab === "history" ? "active" : ""}`}
              onClick={() => setTab("history")}
            >
              📋 Historique
            </button>
            <button
              className={`driver-tab ${tab === "payouts" ? "active" : ""}`}
              onClick={() => setTab("payouts")}
            >
              💰 Retraits
            </button>
            <button
              className={`driver-tab ${tab === "documents" ? "active" : ""}`}
              onClick={() => setTab("documents")}
            >
              📄 Documents
            </button>
            <button
              className={`driver-tab ${tab === "notifications" ? "active" : ""}`}
              onClick={() => setTab("notifications")}
            >
              🔔{unreadCount > 0 && <span className="tab-badge-sm">{unreadCount}</span>}
            </button>
            <button
              className={`driver-tab ${tab === "location" ? "active" : ""}`}
              onClick={() => setTab("location")}
            >
              📍
            </button>
          </div>

          {tab === "dispatch" && (
            isOnline ? (
              <AvailableTripsSection
                token={token}
                onTripAccepted={setActiveTrip}
                onAssistanceAccepted={setActiveAssistance}
              />
            ) : (
              <div className="offline-notice">
                <div className="offline-icon">📴</div>
                <p>Vous êtes hors ligne.</p>
                <p className="offline-sub">Passez en ligne pour voir les missions disponibles.</p>
              </div>
            )
          )}

          {tab === "history"       && <DriverTripHistory token={token} />}
          {tab === "payouts"       && <PayoutSection token={token} />}
          {tab === "documents"     && <DocumentsSection token={token} />}
          {tab === "notifications" && <DriverNotificationsSection token={token} onRead={refreshUnread} />}
          {tab === "location"      && <LocationSection token={token} />}
        </>
      )}

      <p className="footer">App: <strong>web-driver</strong> · Sprint 22</p>
    </div>
  );
}

function AccessDenied({ role, onLogout }) {
  return (
    <div className="app">
      <h1>Ziza Driver</h1>
      <div className="status error">✗ Accès refusé — rôle attendu : {REQUIRED_ROLE} · vous avez : {role}</div>
      <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (!token) { setUser(null); return; }
    fetchMe(token).then(setUser).catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
  }, [token]);

  // After login: upsert user row + driver profile
  useEffect(() => {
    if (!user || user.role !== REQUIRED_ROLE) return;
    registerUser(token)
      .then(() => registerDriver(token))
      .catch(() => {});
  }, [user]);

  async function handleEmailLogin(email, password) {
    setLoginLoading(true); setLoginError(null);
    try {
      const { access_token } = await login(email, password);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  async function handleGoogleLogin() {
    setLoginLoading(true); setLoginError(null);
    try {
      const idToken = await signInWithGoogle();
      localStorage.setItem(TOKEN_KEY, idToken);
      setToken(idToken);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  async function handleLogout() {
    await firebaseSignOut();
    localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null);
  }

  if (!token) return <LoginForm onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} error={loginError} loading={loginLoading} />;
  if (!user)  return <div className="app"><div className="status loading">⏳ Chargement…</div></div>;
  if (user.role !== REQUIRED_ROLE) return <AccessDenied role={user.role} onLogout={handleLogout} />;
  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}
