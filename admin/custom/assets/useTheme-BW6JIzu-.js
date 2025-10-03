import { importShared } from './__federation_fn_import-6j1WaWuS.js';
import { T as ThemeContext, c as createTheme, a as THEME_ID, d as defaultTheme } from './defaultTheme-Cs5GvShw.js';

const React = await importShared('react');
function isObjectEmpty(obj) {
  return Object.keys(obj).length === 0;
}
function useTheme$2(defaultTheme = null) {
  const contextTheme = React.useContext(ThemeContext);
  return !contextTheme || isObjectEmpty(contextTheme) ? defaultTheme : contextTheme;
}

const systemDefaultTheme = createTheme();
function useTheme$1(defaultTheme = systemDefaultTheme) {
  return useTheme$2(defaultTheme);
}

await importShared('react');
function useTheme() {
  const theme = useTheme$1(defaultTheme);
  return theme[THEME_ID] || theme;
}

export { useTheme$2 as a, useTheme as b, useTheme$1 as u };
