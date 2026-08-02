import { StatusBar } from "expo-status-bar"
import { StyleSheet, Text, View } from "react-native"

export default function App() {
  return (
    <View style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.kicker}>Trellis Mobile</Text>
        <Text style={styles.title}>{{ name }}</Text>
        <Text style={styles.body}>Build the app, model the content, and keep product context in the graph.</Text>
      </View>
      <StatusBar style="light" />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: "#111315",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  panel: {
    backgroundColor: "#1f2930",
    borderColor: "#3f5961",
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 420,
    padding: 28,
    width: "100%",
  },
  kicker: {
    color: "#f4b860",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  title: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 40,
    marginBottom: 16,
  },
  body: {
    color: "#c9d4d8",
    fontSize: 16,
    lineHeight: 24,
  },
})
