import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { LanguageProvider } from './i18n';
import { AuthProvider } from './context/AuthContext';

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <main className="min-h-screen grid place-items-center bg-moon-face-50 p-6 text-center" dir="rtl"><div><strong className="text-3xl">Moon Face</strong><p className="my-4 text-charcoal-500">حدث خطأ أثناء تحميل المتجر</p><button onClick={() => window.location.reload()} className="rounded-full border border-moon-face-500 bg-white px-5 py-2 font-bold text-moon-face-800">إعادة المحاولة</button></div></main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary><LanguageProvider><AuthProvider><App /></AuthProvider></LanguageProvider></AppErrorBoundary>
  </StrictMode>
);
