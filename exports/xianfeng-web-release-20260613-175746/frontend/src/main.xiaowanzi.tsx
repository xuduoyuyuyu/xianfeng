import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./store";
import XiaowanziWidget from "./wel/components/XiaowanziWidget";
import { LoginModalProvider } from "./components/LoginModalProvider";

document.title = "小玩子";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LoginModalProvider>
        <XiaowanziWidget standalone />
      </LoginModalProvider>
    </BrowserRouter>
  </Provider>
);
