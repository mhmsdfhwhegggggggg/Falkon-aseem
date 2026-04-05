import { View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";

export interface ScreenContainerProps extends ViewProps {
  edges?: any[];
  className?: string;
  containerClassName?: string;
  safeAreaClassName?: string;
}

export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  return (
    <View
      className={cn("flex-1", "bg-background", containerClassName)}
      {...props}
    >
      <SafeAreaView
        edges={edges}
        className={cn("flex-1", safeAreaClassName)}
        style={style}
      >
        <View className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
