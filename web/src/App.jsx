import { BrowserRouter as Router, Routes, Route, Link, NavLink } from "react-router-dom";
import "./App.css";
import { Dashboard } from "./components/dashboard/Dashboard";
import { OutboundCall } from "./components/outbound/OutboundCall";
import { ManagePhoneNumber } from "./components/settings/ManagePhoneNumber";
import { ManageBot } from "./components/settings/ManageBot";
import { AuthProvider } from "./contexts/AuthContext";
import { Login } from "./components/auth/Login";
import { Register } from "./components/auth/Register";
import { LoginRegister } from "./components/auth/LoginRegister";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { UserMenu } from "./components/auth/UserMenu";
import { AdminSetup } from "./components/admin/AdminSetup";
import { InviteMembers } from "./components/admin/InviteMembers";
import { AppLogo } from "./components/AppLogo";
import "./components/auth/Auth.css";

function AppSidebar() {
	return (
		<aside className="sidebar">
			<div className="sidebar-brand">
				<Link to="/" className="brand-link">
					<AppLogo className="brand-logo" />
					<span className="brand-text">Voice Bot</span>
				</Link>
			</div>
			<nav className="sidebar-nav" aria-label="Main">
				<NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")} end>
					Dashboard
				</NavLink>
				<NavLink to="/outbound" className={({ isActive }) => (isActive ? "active" : "")}>
					Call
				</NavLink>
				<NavLink to="/settings/phone" className={({ isActive }) => (isActive ? "active" : "")}>
					Phone
				</NavLink>
				<NavLink to="/settings/bot" className={({ isActive }) => (isActive ? "active" : "")}>
					Bot Settings
				</NavLink>
			</nav>
			<div className="sidebar-footer">
				<UserMenu />
			</div>
		</aside>
	);
}

function App() {
	return (
		<Router>
			<AuthProvider>
				<Routes>
					<Route path="/login-register" element={<LoginRegister />} />
					<Route path="/login" element={<Login />} />
					<Route path="/register" element={<Register />} />
					<Route path="/admin" element={<AdminSetup />} />

					<Route
						path="/*"
						element={
							<ProtectedRoute>
								<div className="app">
									<AppSidebar />
									<main className="main-content">
										<Routes>
											<Route path="/" element={<Dashboard />} />
											<Route path="/outbound" element={<OutboundCall />} />
											<Route path="/settings/phone" element={<ManagePhoneNumber />} />
											<Route path="/settings/bot" element={<ManageBot />} />
											<Route path="/invite" element={<InviteMembers />} />
										</Routes>
									</main>
								</div>
							</ProtectedRoute>
						}
					/>
				</Routes>
			</AuthProvider>
		</Router>
	);
}

export default App;
