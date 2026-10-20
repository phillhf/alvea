import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import BedReprocessing from "./pages/BedReprocessing";
import RoomCleaning from "./pages/RoomCleaning";
import StationView from "./pages/StationView";
import RoomStationView from "./pages/RoomStationView";
import NewBedTask from "./pages/NewBedTask";
import NewRoomTask from "./pages/NewRoomTask";
import TaskDetail from "./pages/TaskDetail";
import Profile from "./pages/Profile";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { OfflineProvider } from "./contexts/OfflineContext";

function SmartHome() {
  const { can } = useAuth();
  if (can("stationspersonal") && !can("bettenaufbereitung") && !can("verwaltung")) {
    return <Navigate to="/meine-station" replace />;
  }
  if (!can("bettenaufbereitung") && !can("verwaltung")) {
    if (can("bettenaufbereitung_zentral")) return <Navigate to="/zentral" replace />;
    if (can("zimmerreinigung"))            return <Navigate to="/room-cleaning" replace />;
    if (can("betten_reparatur"))           return <Navigate to="/instandsetzung" replace />;
    if (can("berichte"))                   return <Navigate to="/reports" replace />;
    if (can("dashboard"))                  return <Navigate to="/dashboard" replace />;
    if (can("raumbuchung") || can("raumbuchungsadmin")) return <Navigate to="/raumbuchung" replace />;
  }
  return <BedReprocessing />;
}

// Lazy-loaded chunks – werden erst bei Bedarf geladen
const BedZentral      = lazy(() => import("./pages/BedZentral"));
const NewZentralTask  = lazy(() => import("./pages/NewZentralTask"));
const Reports         = lazy(() => import("./pages/Reports"));
const AdminUsers      = lazy(() => import("./pages/AdminUsers"));
const AdminHierarchy  = lazy(() => import("./pages/AdminHierarchy"));
const Dashboard       = lazy(() => import("./pages/Dashboard"));
const OxygenTransport            = lazy(() => import("./pages/OxygenTransport"));
const BedDefects                 = lazy(() => import("./pages/BedDefects"));
const BedDefectDetail            = lazy(() => import("./pages/BedDefectDetail"));
const NewBedDefect               = lazy(() => import("./pages/NewBedDefect"));
const DefectStationView          = lazy(() => import("./pages/DefectStationView"));
const DefectBoard                = lazy(() => import("./pages/DefectBoard"));
const NewDefectReport            = lazy(() => import("./pages/NewDefectReport"));
const Instandsetzung             = lazy(() => import("./pages/Instandsetzung"));
const Bettenstamm                = lazy(() => import("./pages/Bettenstamm"));
const BettenPW                   = lazy(() => import("./pages/BettenPW"));
const Meldungen                  = lazy(() => import("./pages/Meldungen"));
const Spindverwaltung            = lazy(() => import("./pages/Spindverwaltung"));
const Raumbuch                   = lazy(() => import("./pages/Raumbuch"));
const Ruecksendungen             = lazy(() => import("./pages/Ruecksendungen"));
const Raumbuchung                = lazy(() => import("./pages/Raumbuchung"));
const BenutzerRollen             = lazy(() => import("./pages/BenutzerRollen"));
const MeineStation               = lazy(() => import("./pages/MeineStation"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
        Wird geladen…
      </div>
    </div>
  );
}

export default function App() {
  return (
    <OfflineProvider>
    <ToastProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {/* Bettenaufbereitung Dezentral – immer im Haupt-Bundle */}
        <Route path="/" element={<SmartHome />} />
        <Route path="/stations/:id"                  element={<StationView />} />
        <Route path="/stations/:id/new-bed"          element={<NewBedTask />} />
        <Route path="/new-bed"                       element={<NewBedTask />} />
        <Route path="/stations/:id/new-room"         element={<NewRoomTask />} />

        {/* Bettenaufbereitung Zentral – eigener Chunk */}
        <Route path="/zentral" element={
          <Suspense fallback={<PageLoader />}><BedZentral /></Suspense>
        } />
        <Route path="/zentral/new" element={
          <Suspense fallback={<PageLoader />}><NewZentralTask /></Suspense>
        } />

        {/* Zimmerreinigung – immer im Haupt-Bundle */}
        <Route path="/rooms"                         element={<RoomCleaning />} />
        <Route path="/rooms/stations/:id"            element={<RoomStationView />} />

        <Route path="/tasks/:id"                     element={<TaskDetail />} />
        <Route path="/profile"                       element={<Profile />} />

        {/* Berichte – eigener Chunk */}
        <Route path="/reports" element={
          <Suspense fallback={<PageLoader />}><Reports /></Suspense>
        } />

        {/* Admin – eigener Chunk */}
        <Route path="/admin/hierarchy" element={
          <ProtectedRoute permission="verwaltung">
            <Suspense fallback={<PageLoader />}><AdminHierarchy /></Suspense>
          </ProtectedRoute>
        } />

        {/* Sauerstofftransport – Modul */}
        <Route path="/oxygen-transport" element={
          <Suspense fallback={<PageLoader />}><OxygenTransport /></Suspense>
        } />

        {/* Betten-Reparatur – Modul */}
        <Route path="/meine-station" element={
          <Suspense fallback={<PageLoader />}><MeineStation /></Suspense>
        } />
        <Route path="/instandsetzung" element={
          <Suspense fallback={<PageLoader />}><Instandsetzung /></Suspense>
        } />
        <Route path="/bettenstamm" element={
          <Suspense fallback={<PageLoader />}><Bettenstamm /></Suspense>
        } />
        <Route path="/betten-pw" element={
          <Suspense fallback={<PageLoader />}><BettenPW /></Suspense>
        } />
        <Route path="/meldungen" element={
          <ProtectedRoute permission="meldungen">
            <Suspense fallback={<PageLoader />}><Meldungen /></Suspense>
          </ProtectedRoute>
        } />

        <Route path="/spindverwaltung" element={
          <ProtectedRoute permission="spindverwaltung">
            <Suspense fallback={<PageLoader />}><Spindverwaltung /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/raumbuch" element={
          <ProtectedRoute permission="raumbuch">
            <Suspense fallback={<PageLoader />}><Raumbuch /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/ruecksendungen" element={
          <ProtectedRoute anyOf={["verwaltung", "lager"]}>
            <Suspense fallback={<PageLoader />}><Ruecksendungen /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/raumbuchung" element={
          <ProtectedRoute anyOf={["raumbuchung", "raumbuchungsadmin", "verwaltung"]}>
            <Suspense fallback={<PageLoader />}><Raumbuchung /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/benutzer-rollen" element={
          <ProtectedRoute permission="benutzerverwaltung">
            <Suspense fallback={<PageLoader />}><BenutzerRollen /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/bed-defects" element={
          <Suspense fallback={<PageLoader />}><DefectBoard /></Suspense>
        } />
        <Route path="/bed-defects/melden" element={
          <Suspense fallback={<PageLoader />}><NewDefectReport /></Suspense>
        } />
        <Route path="/bed-defects/board" element={
          <Suspense fallback={<PageLoader />}><DefectBoard /></Suspense>
        } />
        <Route path="/bed-defects/station/:stationId" element={
          <Suspense fallback={<PageLoader />}><DefectStationView /></Suspense>
        } />
        <Route path="/bed-defects/neu/:bedId" element={
          <Suspense fallback={<PageLoader />}><NewBedDefect /></Suspense>
        } />
        <Route path="/bed-defects/:id" element={
          <Suspense fallback={<PageLoader />}><BedDefectDetail /></Suspense>
        } />

        {/* Dashboard – eigener Chunk */}
        <Route path="/dashboard" element={
          <Suspense fallback={<PageLoader />}><Dashboard /></Suspense>
        } />

      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ToastProvider>
    </OfflineProvider>
  );
}
