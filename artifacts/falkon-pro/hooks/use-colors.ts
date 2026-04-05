import { Colors, type ColorScheme, type ThemeColorPalette } from "@/lib/theme";
import { useColorScheme } from "react-native";

export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const colorSchema = useColorScheme();
  const scheme = (colorSchemeOverride ?? colorSchema ?? "dark") as ColorScheme;
  return Colors[scheme];
}
