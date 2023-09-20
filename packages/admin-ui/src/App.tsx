import React, { useCallback, useEffect, useState } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { startApi, apiAuth, LoginStatus } from "api";
// Components
import { ToastContainer } from "react-toastify";
import NotificationsMain from "./components/NotificationsMain";
import ErrorBoundary from "./components/ErrorBoundary";
import Loading from "components/Loading";
import Welcome from "components/welcome/Welcome";
import SideBar from "components/sidebar/SideBar";
import { TopBar } from "components/topbar/TopBar";
import { rootPath as dashboardRootPath } from "./pages/dashboard";
// Pages
import { pages } from "./pages";
import { Login } from "./start-pages/Login";
import { Register } from "./start-pages/Register";
import { NoConnection } from "start-pages/NoConnection";
// Types
import { AppContextIface } from "types";

export const AppContext = React.createContext<AppContextIface>({
  theme: "light",
  stakersModuleStatus: "enabled",
  rollupsModuleStatus: "disabled",
  toggleTheme: () => {},
  toggleStakersModuleStatus: () => {},
  toggleRollupsModuleStatus: () => {}
});

const useLocalStorage = (key: string, initialValue: string) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(storedValue));
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
};

function MainApp({ username }: { username: string }) {
  // App is the parent container of any other component.
  // If this re-renders, the whole app will. So DON'T RERENDER APP!
  // Check ONCE what is the status of the VPN and redirect to the login page.

  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [theme, setTheme] = useLocalStorage("theme", "light");
  const [usage, setUsage] = useLocalStorage("usage", "advanced");
  const [stakersModuleStatus, setStakersModuleStatus] = useLocalStorage(
    "stakersModuleStatus",
    "enabled"
  );
  const [rollupsModuleStatus, setRollupsModuleStatus] = useLocalStorage(
    "rollupsModuleStatus",
    "disabled"
  );

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Scroll to top on pathname change
  const screenLocation = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenLocation.pathname]);

  const contextValue = {
    theme,
    usage,
    stakersModuleStatus,
    rollupsModuleStatus,
    toggleTheme: () =>
      setTheme((curr: string) => (curr === "light" ? "dark" : "light")),
    toggleUsage: () =>
      setUsage((curr: string) => (curr === "basic" ? "advanced" : "basic")),
    toggleStakersModuleStatus: () =>
      setStakersModuleStatus((curr: string) =>
        curr === "enabled" ? "disabled" : "enabled"
      ),
    toggleRollupsModuleStatus: () =>
      setRollupsModuleStatus((curr: string) =>
        curr === "enabled" ? "disabled" : "enabled"
      )
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="body" id={theme}>
        <SideBar screenWidth={screenWidth} />
        <TopBar
          username={username}
          theme={theme}
          toggleUsage={contextValue.toggleUsage}
          toggleTheme={contextValue.toggleTheme}
        />
        <div id="main">
          <ErrorBoundary>
            <NotificationsMain />
          </ErrorBoundary>
          <Routes>
            {/** Provide the app context only to the dashboard (where the modules switch is handled) */}
            {Object.values(pages).map(({ RootComponent, rootPath }) =>
              rootPath === dashboardRootPath ? (
                <Route
                  key={rootPath}
                  path={rootPath}
                  element={
                    <ErrorBoundary>
                      <RootComponent
                        modulesContext={{
                          stakersModuleStatus: contextValue.stakersModuleStatus,
                          rollupsModuleStatus: contextValue.rollupsModuleStatus,
                          toggleStakersModuleStatus:
                            contextValue.toggleStakersModuleStatus,
                          toggleRollupsModuleStatus:
                            contextValue.toggleRollupsModuleStatus
                        }}
                      />
                    </ErrorBoundary>
                  }
                />
              ) : (
                <Route
                  key={rootPath}
                  path={rootPath}
                  element={
                    <ErrorBoundary>
                      <RootComponent />
                    </ErrorBoundary>
                  }
                />
              )
            )}
            {/* Redirection for routes with hashes */}
            {/* 404 routes redirect to dashboard or default page */}
            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
        </div>

        {/* Place here non-page components */}
        <Welcome />
        <ToastContainer />
      </div>
    </AppContext.Provider>
  );
}

function DefaultRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/") {
      navigate("/dashboard", { replace: true });
    }
  }, [location, navigate]);

  return null;
}

export default function App() {
  const [loginStatus, setLoginStatus] = useState<LoginStatus>();
  // Handles the login, register and connecting logic. Nothing else will render
  // Until the app has been logged in
  const isLoggedIn = loginStatus?.status === "logged-in";
  const isError = loginStatus?.status === "error";

  const onFetchLoginStatus = useCallback(async () => {
    try {
      setLoginStatus(await apiAuth.fetchLoginStatus());
    } catch (e) {
      console.error("Error on fetchLoginStatus", e);
    }
  }, []);

  useEffect(() => {
    onFetchLoginStatus();
  }, [onFetchLoginStatus]);

  // Start API and Socket.io once user has logged in
  useEffect(() => {
    if (isLoggedIn)
      startApi(onFetchLoginStatus).catch(e =>
        console.error("Error on startApi", e)
      );
  }, [isLoggedIn, onFetchLoginStatus]);

  // Keep retrying if there is a loggin error, probably due a network error
  useEffect(() => {
    if (isError) {
      let timeToNext = 500;
      let timeout: unknown;
      const recursiveTimeout = () => {
        onFetchLoginStatus();
        timeout = setTimeout(recursiveTimeout, (timeToNext *= 2));
      };
      recursiveTimeout();
      return () => clearTimeout(timeout as number);
    }
  }, [isError, onFetchLoginStatus]);

  if (!loginStatus) {
    return <Loading steps={["Opening connection"]} />;
  }

  switch (loginStatus.status) {
    case "logged-in":
      return <MainApp username={loginStatus.username} />;
    case "not-logged-in":
      return <Login refetchStatus={onFetchLoginStatus} />;
    case "not-registered":
      return <Register refetchStatus={onFetchLoginStatus} />;
    case "error":
      return <NoConnection error={loginStatus.error} />;
    default:
      return <NoConnection />;
  }
}
