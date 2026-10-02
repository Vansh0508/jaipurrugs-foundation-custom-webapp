import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/lightswind/toaster";
import { AuthProvider } from "./context/AuthContext.jsx";
import { RequireAdmin, RequireVisitor } from "./components/RouteGuards.jsx";
import Landing from "./pages/Landing.jsx";
import AdminLogin from "./pages/admin/AdminLogin.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import AdminCalendar from "./pages/admin/AdminCalendar.jsx";
import AdminTrips from "./pages/admin/AdminTrips.jsx";
import AdminVillages from "./pages/admin/AdminVillages.jsx";
import AdminPartners from "./pages/admin/AdminPartners.jsx";
import AdminImpact from "./pages/admin/AdminImpact.jsx";
import VisitorLogin from "./pages/visitor/VisitorLogin.jsx";
import VisitorPortal from "./pages/visitor/VisitorPortal.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<Navigate to="calendar" replace />} />
          <Route path="calendar" element={<AdminCalendar />} />
          <Route path="trips" element={<AdminTrips />} />
          <Route path="villages" element={<AdminVillages />} />
          <Route path="partners" element={<AdminPartners />} />
          <Route path="impact" element={<AdminImpact />} />
        </Route>
        <Route path="/visitor/login" element={<VisitorLogin />} />
        <Route path="/visitor" element={<RequireVisitor><VisitorPortal /></RequireVisitor>} />
      </Routes>
    </AuthProvider>
  );
}
