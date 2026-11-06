import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "../resources/locales/zh-CN/app.json";
import en from "../resources/locales/en-US/app.json";

export const systemLocale = () =>
  navigator.languages.find((v) => /^(zh|en)/.test(v))?.startsWith("zh")
    ? "zh-CN"
    : "en-US";
void i18n.use(initReactI18next).init({
  resources: { "zh-CN": { translation: zh }, "en-US": { translation: en } },
  lng: systemLocale(),
  fallbackLng: "en-US",
  keySeparator: false,
  interpolation: { escapeValue: false },
});
export default i18n;
