import { Redirect } from "expo-router";

// Auth disabled — go straight to the main app
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
