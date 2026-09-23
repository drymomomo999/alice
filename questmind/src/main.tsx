import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const appModule = window.location.hash.startsWith('#/desktop-pet')
  ? import('./DesktopPetApp.tsx')
  : import('./App.tsx')

void appModule.then(({ default: RootApp }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootApp />
    </StrictMode>,
  )
})
