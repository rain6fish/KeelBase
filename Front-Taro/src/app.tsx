 import { Component, PropsWithChildren } from 'react'
 import { useAuthStore } from './stores/auth-store'
 import { useThemeStore } from './stores/theme-store'
 import './app.scss'
 
 class App extends Component<PropsWithChildren> {
   componentDidMount() {
     // Initialize stores on app launch
     useAuthStore.getState().tryAutoLogin()
     useThemeStore.getState().initialize()
   }
 
   componentDidHide() {}
 
   // This component must remain a class for Taro compatibility
   render() {
     return this.props.children
   }
 }
 
 export default App
