import { useState, useEffect } from "react";
import {
	BrowserRouter as Router,
	Routes,
	Route,
	Link,
	NavLink,
	useLocation,
} from "react-router-dom";
import "./App.css";
import { Dashboard } from "./components/dashboard/Dashboard";
import { CallRecords } from "./components/dashboard/CallRecords";
import { OutboundCall } from "./components/outbound/OutboundCall";
import { ManagePhoneNumber } from "./components/settings/ManagePhoneNumber";
import { ManageBot } from "./components/settings/ManageBot";
import { InboundConfigNumber } from "./components/inbound/InboundConfigNumber";
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
	const location = useLocation();
	const pathname = location.pathname;
	/** Expand Outbound when on place-call or shared phone settings */
	const outboundShouldExpand = pathname === "/outbound" || pathname === "/settings/phone";
	/** Highlight Outbound group header only on place-call (phone settings use Inbound header) */
	const outboundParentActive = pathname === "/outbound";
	const inboundParentActive = pathname === "/inbound/config-number";

	const [outboundOpen, setOutboundOpen] = useState(outboundShouldExpand);
	const [inboundOpen, setInboundOpen] = useState(inboundParentActive);

	useEffect(() => {
		if (outboundShouldExpand) setOutboundOpen(true);
	}, [outboundShouldExpand]);

	useEffect(() => {
		if (inboundParentActive) setInboundOpen(true);
	}, [inboundParentActive]);

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
				<NavLink to="/calls" className={({ isActive }) => (isActive ? "active" : "")}>
					Calls
				</NavLink>
				<div
					className={`sidebar-nav-group${outboundParentActive ? " sidebar-nav-group--active" : ""}`}
				>
					<button
						type="button"
						className="sidebar-nav-group__trigger"
						onClick={() => setOutboundOpen((o) => !o)}
						aria-expanded={outboundOpen}
						aria-controls="sidebar-outbound-sub"
						id="sidebar-outbound-trigger"
					>
						<span>Outbound</span>
						<svg
							className={`sidebar-nav-group__chevron${outboundOpen ? " sidebar-nav-group__chevron--open" : ""}`}
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>
					{outboundOpen && (
						<div
							className="sidebar-nav-group__sub"
							id="sidebar-outbound-sub"
							role="group"
							aria-labelledby="sidebar-outbound-trigger"
						>
							<NavLink
								to="/outbound"
								className={({ isActive }) =>
									`sidebar-nav-group__sublink${isActive ? " active" : ""}`
								}
							>
								Place Call
							</NavLink>
							<NavLink
								to="/settings/phone"
								className={({ isActive }) =>
									`sidebar-nav-group__sublink${isActive ? " active" : ""}`
								}
							>
								Config Number
							</NavLink>
						</div>
					)}
				</div>
				<div
					className={`sidebar-nav-group${inboundParentActive ? " sidebar-nav-group--active" : ""}`}
				>
					<button
						type="button"
						className="sidebar-nav-group__trigger"
						onClick={() => setInboundOpen((o) => !o)}
						aria-expanded={inboundOpen}
						aria-controls="sidebar-inbound-sub"
						id="sidebar-inbound-trigger"
					>
						<span>Inbound</span>
						<svg
							className={`sidebar-nav-group__chevron${inboundOpen ? " sidebar-nav-group__chevron--open" : ""}`}
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>
					{inboundOpen && (
						<div
							className="sidebar-nav-group__sub"
							id="sidebar-inbound-sub"
							role="group"
							aria-labelledby="sidebar-inbound-trigger"
						>
							<NavLink
								to="/inbound/config-number"
								className={({ isActive }) =>
									`sidebar-nav-group__sublink${isActive ? " active" : ""}`
								}
							>
								Config Number
							</NavLink>
						</div>
					)}
				</div>
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
											<Route path="/calls" element={<CallRecords />} />
											<Route path="/outbound" element={<OutboundCall />} />
											<Route path="/settings/phone" element={<ManagePhoneNumber />} />
											<Route path="/inbound/config-number" element={<InboundConfigNumber />} />
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
