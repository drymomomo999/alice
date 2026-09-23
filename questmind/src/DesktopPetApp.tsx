import { HashRouter, Route, Routes } from 'react-router-dom'
import { DesktopPetPage } from '@/pages/DesktopPet'

/**
 * 桌宠使用独立入口，避免常驻小窗启动时下载、解析并执行主应用的认证、PDF、
 * 课程与页面代码。它只读取 Zustand 已持久化的轻量快照。
 */
function DesktopPetApp() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/desktop-pet" element={<DesktopPetPage />} />
      </Routes>
    </HashRouter>
  )
}

export default DesktopPetApp
