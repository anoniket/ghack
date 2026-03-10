import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  children: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
}

export default class CrashBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[mrigAI] ${this.props.name || 'Component'} crashed:`, error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>!</Text>
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            {this.props.name ? `${this.props.name} crashed` : 'An error occurred'}
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.btnText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconText: {
    color: '#E8C8A0',
    fontSize: 24,
    fontWeight: '800',
  },
  title: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
  },
  btn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: '#E8C8A0',
  },
  btnText: {
    color: '#0D0D0D',
    fontSize: 15,
    fontWeight: '700',
  },
});
