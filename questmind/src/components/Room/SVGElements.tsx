import React from 'react'

// SVG 图标组件 - 替代 emoji
export const RoomBackground = ({ theme }: { theme: string }) => {
  const backgrounds = {
    default: (
      <svg viewBox="0 0 400 300" className="w-full h-full">
        {/* 天空 */}
        <rect x="0" y="0" width="400" height="200" fill="#E8F4FD" />
        {/* 墙壁 */}
        <rect x="0" y="100" width="400" height="200" fill="#FFF8E7" />
        {/* 地板 */}
        <rect x="0" y="250" width="400" height="50" fill="#DEB887" />
        {/* 窗户 */}
        <rect x="280" y="120" width="80" height="60" fill="#87CEEB" rx="5" />
        <line x1="320" y1="120" x2="320" y2="180" stroke="#FFF" strokeWidth="3" />
        <line x1="280" y1="150" x2="360" y2="150" stroke="#FFF" strokeWidth="3" />
        {/* 窗帘 */}
        <path d="M275 115 Q280 150 275 185 L285 185 Q290 150 285 115 Z" fill="#FFB6C1" />
        <path d="M365 115 Q360 150 365 185 L355 185 Q350 150 355 115 Z" fill="#FFB6C1" />
        {/* 太阳 */}
        <circle cx="330" cy="140" r="15" fill="#FFD700" opacity="0.8" />
        {/* 地板纹理 */}
        <line x1="0" y1="270" x2="400" y2="270" stroke="#C4A574" strokeWidth="1" />
        <line x1="0" y1="285" x2="400" y2="285" stroke="#C4A574" strokeWidth="1" />
        <line x1="0" y1="295" x2="400" y2="295" stroke="#C4A574" strokeWidth="1" />
      </svg>
    ),
    forest: (
      <svg viewBox="0 0 400 300" className="w-full h-full">
        {/* 天空 */}
        <rect x="0" y="0" width="400" height="200" fill="#E0F7E9" />
        {/* 墙壁 - 森林绿 */}
        <rect x="0" y="100" width="400" height="200" fill="#C8E6C9" />
        {/* 地板 */}
        <rect x="0" y="250" width="400" height="50" fill="#8B4513" />
        {/* 窗户 */}
        <rect x="280" y="120" width="80" height="60" fill="#81C784" rx="5" />
        <line x1="320" y1="120" x2="320" y2="180" stroke="#FFF" strokeWidth="3" />
        <line x1="280" y1="150" x2="360" y2="150" stroke="#FFF" strokeWidth="3" />
        {/* 窗外树 */}
        <ellipse cx="290" cy="140" rx="10" ry="15" fill="#2E7D32" />
        <ellipse cx="310" cy="135" rx="12" ry="18" fill="#388E3C" />
        <ellipse cx="335" cy="140" rx="10" ry="15" fill="#2E7D32" />
        {/* 地板纹理 */}
        <line x1="0" y1="270" x2="400" y2="270" stroke="#6B3510" strokeWidth="1" />
        <line x1="0" y1="285" x2="400" y2="285" stroke="#6B3510" strokeWidth="1" />
      </svg>
    ),
    ocean: (
      <svg viewBox="0 0 400 300" className="w-full h-full">
        {/* 天空 */}
        <rect x="0" y="0" width="400" height="200" fill="#B3E5FC" />
        {/* 墙壁 */}
        <rect x="0" y="100" width="400" height="200" fill="#E1F5FE" />
        {/* 地板 */}
        <rect x="0" y="250" width="400" height="50" fill="#E0E0E0" />
        {/* 大窗户 */}
        <rect x="260" y="110" width="120" height="100" fill="#4FC3F7" rx="5" />
        <line x1="320" y1="110" x2="320" y2="210" stroke="#FFF" strokeWidth="3" />
        <line x1="260" y1="160" x2="380" y2="160" stroke="#FFF" strokeWidth="3" />
        {/* 海浪 */}
        <path d="M265 180 Q280 170 295 180 T325 180 T355 180 T385 180" stroke="#FFF" strokeWidth="2" fill="none" />
        {/* 窗框 */}
        <rect x="260" y="110" width="120" height="100" fill="none" stroke="#8B4513" strokeWidth="8" rx="5" />
        {/* 地板纹理 */}
        <line x1="0" y1="270" x2="400" y2="270" stroke="#BDBDBD" strokeWidth="1" />
      </svg>
    ),
    rainy: (
      <svg viewBox="0 0 400 300" className="w-full h-full">
        {/* 天空 */}
        <rect x="0" y="0" width="400" height="200" fill="#78909C" />
        {/* 墙壁 */}
        <rect x="0" y="100" width="400" height="200" fill="#ECEFF1" />
        {/* 地板 */}
        <rect x="0" y="250" width="400" height="50" fill="#BDBDBD" />
        {/* 窗户 */}
        <rect x="280" y="120" width="80" height="60" fill="#90A4AE" rx="5" />
        <line x1="320" y1="120" x2="320" y2="180" stroke="#FFF" strokeWidth="3" />
        <line x1="280" y1="150" x2="360" y2="150" stroke="#FFF" strokeWidth="3" />
        {/* 云 */}
        <ellipse cx="300" cy="135" rx="15" ry="10" fill="#CFD8DC" />
        <ellipse cx="315" cy="132" rx="12" ry="8" fill="#CFD8DC" />
        <ellipse cx="340" cy="135" rx="15" ry="10" fill="#CFD8DC" />
        {/* 地板纹理 */}
        <line x1="0" y1="270" x2="400" y2="270" stroke="#9E9E9E" strokeWidth="1" />
        <line x1="0" y1="285" x2="400" y2="285" stroke="#9E9E9E" strokeWidth="1" />
      </svg>
    ),
    sakura: (
      <svg viewBox="0 0 400 300" className="w-full h-full">
        {/* 天空 */}
        <rect x="0" y="0" width="400" height="200" fill="#FCE4EC" />
        {/* 墙壁 */}
        <rect x="0" y="100" width="400" height="200" fill="#FFF0F5" />
        {/* 地板 */}
        <rect x="0" y="250" width="400" height="50" fill="#FFCCBC" />
        {/* 窗户 */}
        <rect x="280" y="120" width="80" height="60" fill="#FFCDD2" rx="5" />
        <line x1="320" y1="120" x2="320" y2="180" stroke="#FFF" strokeWidth="3" />
        <line x1="280" y1="150" x2="360" y2="150" stroke="#FFF" strokeWidth="3" />
        {/* 樱花 */}
        <text x="295" y="145" fontSize="14">🌸</text>
        <text x="330" y="140" fontSize="10">🌸</text>
        <text x="310" y="135" fontSize="8">🌸</text>
        {/* 地板纹理 */}
        <line x1="0" y1="270" x2="400" y2="270" stroke="#BCAAA4" strokeWidth="1" />
      </svg>
    ),
    cozy: (
      <svg viewBox="0 0 400 300" className="w-full h-full">
        {/* 天空 */}
        <rect x="0" y="0" width="400" height="200" fill="#FFF8E1" />
        {/* 墙壁 */}
        <rect x="0" y="100" width="400" height="200" fill="#FFFDE7" />
        {/* 地板 */}
        <rect x="0" y="250" width="400" height="50" fill="#FFECB3" />
        {/* 窗户 */}
        <rect x="280" y="120" width="80" height="60" fill="#FFE082" rx="5" />
        <line x1="320" y1="120" x2="320" y2="180" stroke="#FFF" strokeWidth="3" />
        <line x1="280" y1="150" x2="360" y2="150" stroke="#FFF" strokeWidth="3" />
        {/* 窗帘 */}
        <path d="M275 115 Q280 150 275 185 L285 185 Q290 150 285 115 Z" fill="#FFAB91" />
        <path d="M365 115 Q360 150 365 185 L355 185 Q350 150 355 115 Z" fill="#FFAB91" />
        {/* 阳光 */}
        <circle cx="330" cy="140" r="12" fill="#FFCA28" opacity="0.9" />
        {/* 地板纹理 */}
        <line x1="0" y1="270" x2="400" y2="270" stroke="#FFD54F" strokeWidth="1" />
        <line x1="0" y1="285" x2="400" y2="285" stroke="#FFD54F" strokeWidth="1" />
      </svg>
    ),
  }
  return backgrounds[theme as keyof typeof backgrounds] || backgrounds.default
}

// AI 伙伴 SVG 组件
export const CompanionSVG = ({ state, size = 120 }: { state: string; size?: number }) => {
  const baseColor = '#FFB74D'
  
  const companions = {
    idle: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* 身体 */}
        <ellipse cx="50" cy="55" rx="35" ry="30" fill={baseColor} />
        {/* 肚子 */}
        <ellipse cx="50" cy="60" rx="25" ry="20" fill="#FFE0B2" />
        {/* 头 */}
        <circle cx="50" cy="35" r="28" fill={baseColor} />
        {/* 眼睛 */}
        <ellipse cx="40" cy="32" rx="6" ry="7" fill="#333" />
        <ellipse cx="60" cy="32" rx="6" ry="7" fill="#333" />
        <circle cx="42" cy="30" r="2" fill="#FFF" />
        <circle cx="62" cy="30" r="2" fill="#FFF" />
        {/* 腮红 */}
        <ellipse cx="30" cy="40" rx="6" ry="4" fill="#FFAB91" opacity="0.6" />
        <ellipse cx="70" cy="40" rx="6" ry="4" fill="#FFAB91" opacity="0.6" />
        {/* 嘴巴 */}
        <path d="M45 45 Q50 50 55 45" stroke="#333" strokeWidth="2" fill="none" />
        {/* 耳朵 */}
        <ellipse cx="25" cy="15" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="75" cy="15" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="25" cy="15" rx="5" ry="6" fill="#FFCC80" />
        <ellipse cx="75" cy="15" rx="5" ry="6" fill="#FFCC80" />
      </svg>
    ),
    sleeping: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* 身体 */}
        <ellipse cx="50" cy="60" rx="40" ry="25" fill={baseColor} />
        {/* 肚子 */}
        <ellipse cx="50" cy="62" rx="30" ry="18" fill="#FFE0B2" />
        {/* 头 */}
        <circle cx="50" cy="40" r="25" fill={baseColor} />
        {/* 闭眼 */}
        <path d="M35 38 Q40 42 45 38" stroke="#333" strokeWidth="2" fill="none" />
        <path d="M55 38 Q60 42 65 38" stroke="#333" strokeWidth="2" fill="none" />
        {/* 腮红 */}
        <ellipse cx="32" cy="42" rx="5" ry="3" fill="#FFAB91" opacity="0.6" />
        <ellipse cx="68" cy="42" rx="5" ry="3" fill="#FFAB91" opacity="0.6" />
        {/* 嘴巴 */}
        <ellipse cx="50" cy="48" rx="3" ry="2" fill="#333" />
        {/* 耳朵 */}
        <ellipse cx="28" cy="20" rx="7" ry="9" fill={baseColor} />
        <ellipse cx="72" cy="20" rx="7" ry="9" fill={baseColor} />
        {/* ZZZ */}
        <text x="70" y="25" fontSize="12" fill="#90CAF9" fontWeight="bold">Z</text>
        <text x="78" y="18" fontSize="10" fill="#90CAF9" fontWeight="bold">z</text>
        <text x="84" y="12" fontSize="8" fill="#90CAF9" fontWeight="bold">z</text>
        {/* 枕头 */}
        <ellipse cx="75" cy="55" rx="12" ry="8" fill="#E1BEE7" />
      </svg>
    ),
    eating: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* 身体 */}
        <ellipse cx="50" cy="55" rx="35" ry="30" fill={baseColor} />
        {/* 肚子 */}
        <ellipse cx="50" cy="60" rx="25" ry="20" fill="#FFE0B2" />
        {/* 头 */}
        <circle cx="50" cy="35" r="28" fill={baseColor} />
        {/* 眼睛 - 开心 */}
        <path d="M34 30 Q40 25 46 30" stroke="#333" strokeWidth="3" fill="none" />
        <path d="M54 30 Q60 25 66 30" stroke="#333" strokeWidth="3" fill="none" />
        {/* 腮红 */}
        <ellipse cx="30" cy="38" rx="6" ry="4" fill="#FFAB91" opacity="0.8" />
        <ellipse cx="70" cy="38" rx="6" ry="4" fill="#FFAB91" opacity="0.8" />
        {/* 嘴巴 - 张开 */}
        <ellipse cx="50" cy="48" rx="8" ry="6" fill="#333" />
        <ellipse cx="50" cy="46" rx="6" ry="3" fill="#FF7043" />
        {/* 耳朵 */}
        <ellipse cx="25" cy="15" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="75" cy="15" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="25" cy="15" rx="5" ry="6" fill="#FFCC80" />
        <ellipse cx="75" cy="15" rx="5" ry="6" fill="#FFCC80" />
        {/* 食物 */}
        <circle cx="75" cy="45" r="8" fill="#8BC34A" />
        <circle cx="75" cy="45" r="5" fill="#CDDC39" />
      </svg>
    ),
    reading: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* 身体 */}
        <ellipse cx="50" cy="55" rx="35" ry="30" fill={baseColor} />
        {/* 肚子 */}
        <ellipse cx="50" cy="60" rx="25" ry="20" fill="#FFE0B2" />
        {/* 书 */}
        <rect x="30" y="55" width="40" height="25" fill="#5C6BC0" rx="2" />
        <rect x="32" y="57" width="17" height="21" fill="#FFF" />
        <line x1="49" y1="57" x2="49" y2="78" stroke="#333" strokeWidth="1" />
        {/* 线 */}
        <line x1="35" y1="62" x2="45" y2="62" stroke="#CCC" strokeWidth="1" />
        <line x1="35" y1="66" x2="45" y2="66" stroke="#CCC" strokeWidth="1" />
        <line x1="35" y1="70" x2="45" y2="70" stroke="#CCC" strokeWidth="1" />
        {/* 头 */}
        <circle cx="50" cy="35" r="28" fill={baseColor} />
        {/* 眼镜 */}
        <circle cx="40" cy="32" r="10" fill="none" stroke="#333" strokeWidth="2" />
        <circle cx="60" cy="32" r="10" fill="none" stroke="#333" strokeWidth="2" />
        <line x1="50" y1="32" x2="50" y2="32" stroke="#333" strokeWidth="2" />
        <line x1="30" y1="32" x2="30" y2="32" stroke="#333" strokeWidth="2" />
        {/* 眼睛 - 认真 */}
        <circle cx="40" cy="32" r="4" fill="#333" />
        <circle cx="60" cy="32" r="4" fill="#333" />
        <circle cx="41" cy="31" r="1.5" fill="#FFF" />
        <circle cx="61" cy="31" r="1.5" fill="#FFF" />
        {/* 腮红 */}
        <ellipse cx="30" cy="40" rx="5" ry="3" fill="#FFAB91" opacity="0.5" />
        <ellipse cx="70" cy="40" rx="5" ry="3" fill="#FFAB91" opacity="0.5" />
        {/* 嘴巴 */}
        <ellipse cx="50" cy="48" rx="2" ry="1" fill="#333" />
        {/* 耳朵 */}
        <ellipse cx="25" cy="15" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="75" cy="15" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="25" cy="15" rx="5" ry="6" fill="#FFCC80" />
        <ellipse cx="75" cy="15" rx="5" ry="6" fill="#FFCC80" />
      </svg>
    ),
    playing: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* 身体 */}
        <ellipse cx="50" cy="55" rx="35" ry="30" fill={baseColor} />
        {/* 肚子 */}
        <ellipse cx="50" cy="60" rx="25" ry="20" fill="#FFE0B2" />
        {/* 头 */}
        <circle cx="50" cy="35" r="28" fill={baseColor} />
        {/* 眼睛 - 兴奋 */}
        <ellipse cx="40" cy="30" rx="8" ry="9" fill="#FFF" />
        <ellipse cx="60" cy="30" rx="8" ry="9" fill="#FFF" />
        <circle cx="42" cy="32" r="5" fill="#333" />
        <circle cx="62" cy="32" r="5" fill="#333" />
        <circle cx="43" cy="30" r="2" fill="#FFF" />
        <circle cx="63" cy="30" r="2" fill="#FFF" />
        {/* 腮红 */}
        <ellipse cx="28" cy="38" rx="6" ry="4" fill="#FFAB91" opacity="0.8" />
        <ellipse cx="72" cy="38" rx="6" ry="4" fill="#FFAB91" opacity="0.8" />
        {/* 嘴巴 - 大笑 */}
        <path d="M40 48 Q50 58 60 48" fill="#333" />
        <path d="M42 48 Q50 54 58 48" fill="#FF7043" />
        {/* 耳朵 */}
        <ellipse cx="25" cy="12" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="75" cy="12" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="25" cy="12" rx="5" ry="6" fill="#FFCC80" />
        <ellipse cx="75" cy="12" rx="5" ry="6" fill="#FFCC80" />
        {/* 动感线条 */}
        <line x1="20" y1="50" x2="10" y2="45" stroke="#FFD54F" strokeWidth="2" />
        <line x1="20" y1="55" x2="8" y2="55" stroke="#FFD54F" strokeWidth="2" />
        <line x1="80" y1="50" x2="90" y2="45" stroke="#FFD54F" strokeWidth="2" />
        <line x1="80" y1="55" x2="92" y2="55" stroke="#FFD54F" strokeWidth="2" />
      </svg>
    ),
    traveling: (
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* 身体 */}
        <ellipse cx="50" cy="55" rx="35" ry="30" fill={baseColor} />
        {/* 肚子 */}
        <ellipse cx="50" cy="60" rx="25" ry="20" fill="#FFE0B2" />
        {/* 背包 */}
        <rect x="55" y="45" width="20" height="25" fill="#8D6E63" rx="3" />
        <rect x="58" y="48" width="14" height="8" fill="#6D4C41" rx="2" />
        <circle cx="65" cy="60" r="2" fill="#FFD54F" />
        <circle cx="65" cy="66" r="2" fill="#FFD54F" />
        {/* 头 */}
        <circle cx="50" cy="35" r="28" fill={baseColor} />
        {/* 眼睛 - 兴奋 */}
        <ellipse cx="40" cy="30" rx="7" ry="8" fill="#FFF" />
        <ellipse cx="60" cy="30" rx="7" ry="8" fill="#FFF" />
        <circle cx="42" cy="32" r="4" fill="#333" />
        <circle cx="62" cy="32" r="4" fill="#333" />
        <circle cx="43" cy="30" r="1.5" fill="#FFF" />
        <circle cx="63" cy="30" r="1.5" fill="#FFF" />
        {/* 腮红 */}
        <ellipse cx="30" cy="38" rx="5" ry="3" fill="#FFAB91" opacity="0.7" />
        <ellipse cx="70" cy="38" rx="5" ry="3" fill="#FFAB91" opacity="0.7" />
        {/* 嘴巴 */}
        <ellipse cx="50" cy="46" rx="5" ry="4" fill="#333" />
        {/* 耳朵 */}
        <ellipse cx="25" cy="15" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="75" cy="15" rx="8" ry="10" fill={baseColor} />
        <ellipse cx="25" cy="15" rx="5" ry="6" fill="#FFCC80" />
        <ellipse cx="75" cy="15" rx="5" ry="6" fill="#FFCC80" />
      </svg>
    ),
  }
  
  return companions[state as keyof typeof companions] || companions.idle
}

// 家具 SVG 组件
export const DeskSVG = ({ size = 60 }: { size?: number }) => (
  <svg width={size} height={size * 0.7} viewBox="0 0 80 56">
    {/* 桌面 */}
    <rect x="5" y="15" width="70" height="8" fill="#8D6E63" rx="2" />
    <rect x="5" y="15" width="70" height="3" fill="#A1887F" rx="2" />
    {/* 桌腿 */}
    <rect x="10" y="23" width="6" height="30" fill="#6D4C41" />
    <rect x="64" y="23" width="6" height="30" fill="#6D4C41" />
    {/* 抽屉 */}
    <rect x="25" y="23" width="30" height="15" fill="#795548" rx="1" />
    <circle cx="40" cy="30" r="2" fill="#FFD54F" />
  </svg>
)

export const ChairSVG = ({ size = 50 }: { size?: number }) => (
  <svg width={size} height={size * 1.2} viewBox="0 0 50 60">
    {/* 椅背 */}
    <rect x="5" y="5" width="40" height="25" fill="#FFCC80" rx="5" />
    <rect x="8" y="8" width="34" height="19" fill="#FFE0B2" rx="4" />
    {/* 椅座 */}
    <rect x="5" y="30" width="40" height="10" fill="#FFCC80" rx="3" />
    {/* 椅腿 */}
    <rect x="10" y="40" width="5" height="18" fill="#8D6E63" />
    <rect x="35" y="40" width="5" height="18" fill="#8D6E63" />
  </svg>
)

export const BookshelfSVG = ({ size = 50 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 50 50">
    {/* 书架 */}
    <rect x="2" y="2" width="46" height="46" fill="#8D6E63" rx="2" />
    {/* 隔板 */}
    <rect x="4" y="16" width="42" height="3" fill="#6D4C41" />
    <rect x="4" y="32" width="42" height="3" fill="#6D4C41" />
    {/* 书籍 */}
    <rect x="6" y="4" width="8" height="12" fill="#E57373" rx="1" />
    <rect x="15" y="6" width="6" height="10" fill="#64B5F6" rx="1" />
    <rect x="22" y="4" width="7" height="12" fill="#81C784" rx="1" />
    <rect x="30" y="5" width="8" height="11" fill="#FFB74D" rx="1" />
    <rect x="8" y="20" width="10" height="11" fill="#9575CD" rx="1" />
    <rect x="20" y="19" width="7" height="12" fill="#4DB6AC" rx="1" />
    <rect x="28" y="20" width="9" height="11" fill="#F06292" rx="1" />
    <rect x="38" y="19" width="6" height="12" fill="#90A4AE" rx="1" />
    <rect x="10" y="36" width="8" height="10" fill="#FFD54F" rx="1" />
    <rect x="20" y="35" width="10" height="11" fill="#7986CB" rx="1" />
  </svg>
)

export const PlantSVG = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size * 1.5} viewBox="0 0 40 60">
    {/* 花盆 */}
    <path d="M8 45 L12 58 L28 58 L32 45 Z" fill="#FFAB91" />
    <ellipse cx="20" cy="45" rx="14" ry="4" fill="#FF8A65" />
    {/* 土 */}
    <ellipse cx="20" cy="45" rx="12" ry="3" fill="#5D4037" />
    {/* 叶子 */}
    <ellipse cx="20" cy="30" rx="8" ry="15" fill="#4CAF50" />
    <ellipse cx="12" cy="35" rx="6" ry="12" fill="#66BB6A" />
    <ellipse cx="28" cy="35" rx="6" ry="12" fill="#66BB6A" />
    <ellipse cx="20" cy="25" rx="5" ry="10" fill="#81C784" />
  </svg>
)

// 旅行目的地 SVG
export const DestinationSVG = ({ destination, size = 60 }: { destination: string; size?: number }) => {
  const destinations: Record<string, React.ReactElement> = {
    mountain: (
      <svg width={size} height={size} viewBox="0 0 60 60">
        <polygon points="30,10 50,50 10,50" fill="#78909C" />
        <polygon points="30,10 40,35 20,35" fill="#90A4AE" />
        <polygon points="25,10 30,25 20,25" fill="#FFF" />
        <rect x="0" y="50" width="60" height="10" fill="#81C784" />
      </svg>
    ),
    beach: (
      <svg width={size} height={size} viewBox="0 0 60 60">
        <rect x="0" y="0" width="60" height="35" fill="#4FC3F7" />
        <rect x="0" y="35" width="60" height="25" fill="#FFE082" />
        <circle cx="45" cy="12" r="8" fill="#FFD54F" />
        <ellipse cx="20" cy="42" rx="10" ry="5" fill="#FFF8E1" />
        <path d="M25 40 Q35 30 45 40" fill="#8BC34A" />
        <circle cx="35" cy="32" r="4" fill="#8BC34A" />
      </svg>
    ),
    forest: (
      <svg width={size} height={size} viewBox="0 0 60 60">
        <rect x="0" y="0" width="60" height="60" fill="#E8F5E9" />
        <polygon points="10,50 20,20 30,50" fill="#388E3C" />
        <polygon points="15,50 25,25 35,50" fill="#43A047" />
        <polygon points="30,50 40,15 50,50" fill="#2E7D32" />
        <polygon points="35,50 45,25 55,50" fill="#388E3C" />
        <rect x="8" y="50" width="5" height="10" fill="#6D4C41" />
        <rect x="28" y="50" width="5" height="10" fill="#6D4C41" />
        <rect x="48" y="50" width="5" height="10" fill="#6D4C41" />
      </svg>
    ),
    city: (
      <svg width={size} height={size} viewBox="0 0 60 60">
        <rect x="0" y="0" width="60" height="60" fill="#E3F2FD" />
        <rect x="5" y="30" width="12" height="30" fill="#78909C" />
        <rect x="7" y="33" width="3" height="4" fill="#FFF59D" />
        <rect x="12" y="33" width="3" height="4" fill="#FFF59D" />
        <rect x="17" y="33" width="3" height="4" fill="#90CAF9" />
        <rect x="22" y="20" width="15" height="40" fill="#607D8B" />
        <rect x="24" y="23" width="4" height="5" fill="#FFF59D" />
        <rect x="30" y="23" width="4" height="5" fill="#90CAF9" />
        <rect x="40" y="35" width="10" height="25" fill="#90A4AE" />
        <rect x="50" y="25" width="8" height="35" fill="#78909C" />
      </svg>
    ),
    castle: (
      <svg width={size} height={size} viewBox="0 0 60 60">
        <rect x="0" y="0" width="60" height="60" fill="#E8EAF6" />
        {/* 城堡主体 */}
        <rect x="15" y="25" width="30" height="35" fill="#B39DDB" />
        {/* 塔楼 */}
        <rect x="8" y="20" width="12" height="40" fill="#9575CD" />
        <rect x="40" y="20" width="12" height="40" fill="#9575CD" />
        {/* 塔顶 */}
        <polygon points="8,20 14,5 20,20" fill="#7E57C2" />
        <polygon points="40,20 46,5 52,20" fill="#7E57C2" />
        {/* 门 */}
        <rect x="23" y="45" width="14" height="15" fill="#5D4037" rx="7" />
        {/* 窗户 */}
        <rect x="20" y="32" width="6" height="8" fill="#FFF59D" rx="3" />
        <rect x="34" y="32" width="6" height="8" fill="#FFF59D" rx="3" />
        {/* 旗子 */}
        <line x1="14" y1="5" x2="14" y2="0" stroke="#333" strokeWidth="1" />
        <polygon points="14,0 22,3 14,6" fill="#E91E63" />
      </svg>
    ),
    river: (
      <svg width={size} height={size} viewBox="0 0 60 60">
        <rect x="0" y="0" width="60" height="60" fill="#E0F7FA" />
        <path d="M0 20 Q30 15 60 25 Q30 35 0 30 Z" fill="#4DD0E1" />
        <path d="M0 35 Q30 30 60 40 Q30 50 0 45 Z" fill="#26C6DA" />
        <ellipse cx="15" cy="15" rx="8" ry="5" fill="#A5D6A7" />
        <ellipse cx="45" cy="45" rx="10" ry="6" fill="#81C784" />
        {/* 鱼 */}
        <ellipse cx="30" cy="28" rx="6" ry="3" fill="#FFB74D" />
        <polygon points="38,28 42,25 42,31" fill="#FFB74D" />
        {/* 蜻蜓 */}
        <ellipse cx="48" cy="18" rx="2" ry="4" fill="#64B5F6" />
        <line x1="45" y1="15" x2="51" y2="15" stroke="#64B5F6" strokeWidth="1" />
        <line x1="45" y1="21" x2="51" y2="21" stroke="#64B5F6" strokeWidth="1" />
      </svg>
    ),
    sakura: (
      <svg width={size} height={size} viewBox="0 0 60 60">
        <rect x="0" y="0" width="60" height="60" fill="#FCE4EC" />
        {/* 树干 */}
        <rect x="28" y="30" width="4" height="30" fill="#795548" />
        <rect x="20" y="45" width="3" height="15" fill="#795548" />
        <rect x="37" y="40" width="3" height="20" fill="#795548" />
        {/* 樱花 */}
        <circle cx="30" cy="20" r="18" fill="#F8BBD9" opacity="0.8" />
        <circle cx="20" cy="25" r="12" fill="#F48FB1" opacity="0.7" />
        <circle cx="40" cy="25" r="12" fill="#F48FB1" opacity="0.7" />
        <circle cx="25" cy="12" r="10" fill="#FCE4EC" opacity="0.9" />
        <circle cx="35" cy="12" r="10" fill="#FCE4EC" opacity="0.9" />
        {/* 地面 */}
        <rect x="0" y="55" width="60" height="5" fill="#C8E6C9" />
        {/* 飘落的花瓣 */}
        <circle cx="15" cy="35" r="2" fill="#F8BBD9" />
        <circle cx="50" cy="40" r="2" fill="#F8BBD9" />
        <circle cx="45" cy="15" r="1.5" fill="#F48FB1" />
      </svg>
    ),
  }
  
  return destinations[destination] || destinations.mountain
}

// 纪念品 SVG
export const SouvenirSVG = ({ souvenir, size = 40 }: { souvenir: string; size?: number }) => {
  const souvenirs: Record<string, React.ReactElement> = {
    photo: (
      <svg width={size} height={size} viewBox="0 0 40 40">
        <rect x="2" y="2" width="36" height="36" fill="#FFF" rx="2" />
        <rect x="4" y="4" width="32" height="24" fill="#64B5F6" rx="1" />
        <circle cx="20" cy="14" r="5" fill="#FFD54F" />
        <polygon points="10,28 14,20 20,26 26,18 30,28" fill="#81C784" />
        <rect x="4" y="32" width="32" height="4" fill="#E0E0E0" />
      </svg>
    ),
    postcard: (
      <svg width={size} height={size * 0.7} viewBox="0 0 40 28">
        <rect x="2" y="2" width="36" height="24" fill="#FFF8E1" rx="2" />
        <rect x="4" y="4" width="20" height="14" fill="#FFB74D" rx="1" />
        <text x="26" y="12" fontSize="6" fill="#333">风景</text>
        <line x1="4" y1="20" x2="36" y2="20" stroke="#CCC" strokeWidth="1" />
        <rect x="4" y="22" width="8" height="2" fill="#E57373" />
      </svg>
    ),
    shell: (
      <svg width={size} height={size} viewBox="0 0 40 40">
        <ellipse cx="20" cy="22" rx="14" ry="12" fill="#FFCCBC" />
        <path d="M10 20 Q20 10 30 20" fill="#FFAB91" />
        <path d="M12 18 Q20 12 28 18" fill="#FF8A65" />
        <path d="M14 16 Q20 14 26 16" fill="#FF7043" />
        <ellipse cx="20" cy="24" rx="8" ry="4" fill="#FFF3E0" />
      </svg>
    ),
    leaf: (
      <svg width={size} height={size} viewBox="0 0 40 40">
        <path d="M20 5 Q35 15 25 35 Q20 30 15 35 Q5 15 20 5" fill="#E57373" />
        <path d="M20 8 Q30 18 22 32" stroke="#C62828" strokeWidth="1" fill="none" />
        <path d="M18 15 Q15 20 18 25" stroke="#C62828" strokeWidth="0.5" fill="none" />
        <path d="M22 15 Q25 20 22 25" stroke="#C62828" strokeWidth="0.5" fill="none" />
      </svg>
    ),
    crystal: (
      <svg width={size} height={size} viewBox="0 0 40 40">
        <polygon points="20,2 32,15 26,38 14,38 8,15" fill="#E1BEE7" />
        <polygon points="20,2 26,15 20,38 14,15" fill="#CE93D8" />
        <polygon points="20,2 14,15 8,15" fill="#F3E5F5" />
        <polygon points="20,8 24,15 20,15" fill="#BA68C8" opacity="0.5" />
      </svg>
    ),
    feather: (
      <svg width={size * 0.6} height={size} viewBox="0 0 24 60">
        <path d="M12 5 Q18 20 14 40 Q12 50 12 55 Q12 50 10 40 Q6 20 12 5" fill="#90CAF9" />
        <path d="M12 5 Q16 18 13 38" stroke="#42A5F5" strokeWidth="1" fill="none" />
        <line x1="12" y1="5" x2="12" y2="55" stroke="#1565C0" strokeWidth="1" />
        <path d="M12 10 Q8 15 10 20" stroke="#64B5F6" strokeWidth="0.5" fill="none" />
        <path d="M12 15 Q16 18 14 25" stroke="#64B5F6" strokeWidth="0.5" fill="none" />
      </svg>
    ),
    mushroom: (
      <svg width={size} height={size} viewBox="0 0 40 40">
        <ellipse cx="20" cy="18" rx="15" ry="12" fill="#E53935" />
        <circle cx="14" cy="14" r="3" fill="#FFF" />
        <circle cx="24" cy="12" r="2" fill="#FFF" />
        <circle cx="20" cy="18" r="2" fill="#FFF" />
        <circle cx="28" cy="18" r="2.5" fill="#FFF" />
        <rect x="15" y="28" width="10" height="12" fill="#FFF8E1" rx="3" />
      </svg>
    ),
    acorn: (
      <svg width={size} height={size} viewBox="0 0 40 40">
        <ellipse cx="20" cy="22" rx="12" ry="10" fill="#8D6E63" />
        <path d="M8 15 Q20 5 32 15 Q20 18 8 15" fill="#A1887F" />
        <rect x="18" y="8" width="4" height="5" fill="#6D4C41" />
        <ellipse cx="20" cy="24" rx="6" ry="4" fill="#BCAAA4" />
      </svg>
    ),
  }
  
  return souvenirs[souvenir] || souvenirs.photo
}
