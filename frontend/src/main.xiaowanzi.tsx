import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./store";
import XiaowanziWidget from "./wel/components/XiaowanziWidget";
import { LoginModalProvider } from "./components/LoginModalProvider";
import { hydrateMiniProgramAuthFromUrl } from "./utils/mpAuthBridge";
import "./styles.css";

const isMiniProgramWebView = new URLSearchParams(window.location.search).get("xf_mp") === "1";
document.title = isMiniProgramWebView ? "" : "小玩子";

hydrateMiniProgramAuthFromUrl();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LoginModalProvider>
        <XiaowanziWidget standalone />
      </LoginModalProvider>
    </BrowserRouter>
  </Provider>
);
