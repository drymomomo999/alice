from __future__ import annotations

import math
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = ROOT.parent
LOCAL_DEPS = WORKSPACE_ROOT / ".codex_py"
if LOCAL_DEPS.exists():
    sys.path.insert(0, str(LOCAL_DEPS))

try:
    import imageio_ffmpeg
except ImportError as exc:
    raise SystemExit(
        "Missing imageio-ffmpeg. Install it with:\n"
        f"  python -m pip install --target {LOCAL_DEPS} imageio-ffmpeg"
    ) from exc


W, H = 1920, 1080
FPS = 24
DURATION = 30.0

ASSETS = ROOT / "src" / "assets"
OUT_DIR = ROOT / "promo"
OUT_FILE = OUT_DIR / "questmind-promo.mp4"
COVER_FILE = OUT_DIR / "questmind-promo-cover.png"

FONT_REGULAR = Path(r"C:\Windows\Fonts\NotoSansSC-VF.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
FONT_LIGHT = Path(r"C:\Windows\Fonts\msyhl.ttc")


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    candidates = {
        "bold": [FONT_BOLD, FONT_REGULAR, Path(r"C:\Windows\Fonts\simhei.ttf")],
        "light": [FONT_LIGHT, FONT_REGULAR, Path(r"C:\Windows\Fonts\msyh.ttc")],
        "regular": [FONT_REGULAR, Path(r"C:\Windows\Fonts\msyh.ttc"), Path(r"C:\Windows\Fonts\simhei.ttf")],
    }[weight]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


FONTS = {
    "brand": font(112, "bold"),
    "h1": font(76, "bold"),
    "h2": font(54, "bold"),
    "h3": font(38, "bold"),
    "body": font(31, "regular"),
    "body_bold": font(32, "bold"),
    "small": font(24, "regular"),
    "tiny": font(20, "regular"),
    "num": font(60, "bold"),
}


COLORS = {
    "ink": (42, 34, 48),
    "muted": (126, 105, 118),
    "sakura": (232, 108, 151),
    "sakura_dark": (198, 76, 122),
    "peach": (247, 151, 112),
    "lavender": (152, 130, 220),
    "cream": (255, 248, 242),
    "gold": (212, 166, 76),
    "wine": (108, 34, 54),
    "green": (85, 168, 126),
    "blue": (85, 135, 214),
}


def clamp(v: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, v))


def smoothstep(x: float) -> float:
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out(x: float) -> float:
    x = clamp(x)
    return 1 - pow(1 - x, 3)


def ease_in_out(x: float) -> float:
    x = clamp(x)
    return 0.5 - 0.5 * math.cos(math.pi * x)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def color_lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(lerp(a[i], b[i], t)) for i in range(3))


def rgba(rgb: tuple[int, int, int], alpha: int) -> tuple[int, int, int, int]:
    return rgb[0], rgb[1], rgb[2], alpha


def alpha_composite(base: Image.Image, overlay: Image.Image) -> Image.Image:
    base.alpha_composite(overlay)
    return base


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def draw_text(
    img: Image.Image,
    xy: tuple[float, float],
    text: str,
    fnt: ImageFont.ImageFont,
    fill: tuple[int, int, int] | tuple[int, int, int, int] = COLORS["ink"],
    anchor: str = "la",
    alpha: float = 1.0,
    stroke: int = 0,
    stroke_fill: tuple[int, int, int] | tuple[int, int, int, int] = (255, 255, 255, 180),
) -> None:
    if alpha <= 0:
        return
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if len(fill) == 3:
        fill = (*fill, int(255 * alpha))
    else:
        fill = (fill[0], fill[1], fill[2], int(fill[3] * alpha))
    if len(stroke_fill) == 3:
        stroke_fill = (*stroke_fill, int(255 * alpha))
    else:
        stroke_fill = (stroke_fill[0], stroke_fill[1], stroke_fill[2], int(stroke_fill[3] * alpha))
    d.text(xy, text, font=fnt, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)
    img.alpha_composite(layer)


def draw_wrapped(
    img: Image.Image,
    xy: tuple[int, int],
    text: str,
    fnt: ImageFont.ImageFont,
    width: int,
    line_gap: int = 12,
    fill: tuple[int, int, int] = COLORS["ink"],
    alpha: float = 1.0,
) -> int:
    draw = ImageDraw.Draw(img)
    lines: list[str] = []
    current = ""
    for char in text:
        trial = current + char
        if text_size(draw, trial, fnt)[0] <= width or not current:
            current = trial
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    y = xy[1]
    for line in lines:
        draw_text(img, (xy[0], y), line, fnt, fill=fill, anchor="la", alpha=alpha)
        y += text_size(draw, line, fnt)[1] + line_gap
    return y


def cover(path: Path, size: tuple[int, int]) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    sw, sh = img.size
    tw, th = size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def contain(path: Path, max_size: tuple[int, int]) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    img.thumbnail(max_size, Image.Resampling.LANCZOS)
    return img


def paste_alpha(base: Image.Image, fg: Image.Image, xy: tuple[int, int], alpha: float = 1.0) -> None:
    if alpha <= 0:
        return
    if alpha < 1:
        fg = fg.copy()
        a = fg.getchannel("A")
        fg.putalpha(a.point(lambda p: int(p * alpha)))
    base.alpha_composite(fg, xy)


def rounded_rect(
    img: Image.Image,
    box: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] | None = None,
    width: int = 1,
    shadow: bool = False,
) -> None:
    if shadow:
        shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow_layer)
        x1, y1, x2, y2 = box
        sd.rounded_rectangle((x1 + 10, y1 + 18, x2 + 10, y2 + 18), radius=radius, fill=(80, 45, 65, 30))
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(18))
        img.alpha_composite(shadow_layer)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_gradient_background(t: float, warm: bool = True) -> Image.Image:
    top = color_lerp((255, 246, 249), (251, 238, 247), 0.5 + 0.5 * math.sin(t * 0.4))
    bottom = color_lerp((255, 235, 220), (232, 228, 255), 0.5 + 0.5 * math.cos(t * 0.3))
    if not warm:
        top, bottom = (246, 249, 255), (248, 235, 245)
    arr = Image.new("RGBA", (W, H), top + (255,))
    pix = arr.load()
    for y in range(H):
        k = y / (H - 1)
        c = color_lerp(top, bottom, k)
        for x in range(W):
            pix[x, y] = c + (255,)
    return arr


def vignette(img: Image.Image, strength: int = 80) -> None:
    layer = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(layer)
    margin = -280
    d.ellipse((margin, margin, W - margin, H - margin), fill=255)
    layer = Image.eval(layer.filter(ImageFilter.GaussianBlur(120)), lambda p: 255 - p)
    dark = Image.new("RGBA", (W, H), (45, 25, 45, strength))
    dark.putalpha(layer.point(lambda p: int(p * strength / 255)))
    img.alpha_composite(dark)


def draw_petals(img: Image.Image, t: float, alpha: float = 0.35) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    for i in range(46):
        seed = i * 41.7
        x = (seed * 37 + t * (22 + i % 5 * 9)) % (W + 220) - 110
        y = (seed * 19 + t * (28 + i % 7 * 5)) % (H + 180) - 90
        size = 8 + (i % 6) * 3
        angle = t * 1.8 + i
        c = (255, 178 + (i % 4) * 10, 196 + (i % 3) * 8, int(110 * alpha))
        dx = math.cos(angle) * size
        dy = math.sin(angle) * size * 0.5
        d.ellipse((x - size, y - size / 2, x + size, y + size / 2), fill=c)
        d.line((x, y, x + dx, y + dy), fill=(255, 220, 226, int(70 * alpha)), width=2)


@dataclass(frozen=True)
class Scene:
    start: float
    end: float
    name: str

    def local(self, t: float) -> float:
        return clamp((t - self.start) / (self.end - self.start))


SCENES = [
    Scene(0.0, 4.0, "intro"),
    Scene(4.0, 8.4, "smart"),
    Scene(8.4, 12.8, "dashboard"),
    Scene(12.8, 17.2, "focus"),
    Scene(17.2, 21.8, "quiz"),
    Scene(21.8, 26.2, "room"),
    Scene(26.2, 30.0, "outro"),
]


def scene_alpha(t: float, scene: Scene) -> float:
    fade = 0.45
    a_in = clamp((t - scene.start) / fade)
    a_out = clamp((scene.end - t) / fade)
    return min(smoothstep(a_in), smoothstep(a_out))


def draw_scene_title(img: Image.Image, label: str, title: str, subtitle: str, t: float, scene: Scene) -> None:
    a = scene_alpha(t, scene)
    p = scene.local(t)
    x = int(128 + (1 - ease_out(p)) * -40)
    title_font = FONTS["h1"] if len(title.replace(" ", "")) <= 8 else FONTS["h2"]
    draw_text(img, (x, 126), label, FONTS["small"], fill=COLORS["sakura_dark"], anchor="la", alpha=a)
    draw_text(img, (x, 190), title, title_font, fill=COLORS["ink"], anchor="la", alpha=a)
    draw_wrapped(img, (x, 282), subtitle, FONTS["body"], 710, fill=COLORS["muted"], alpha=a)


def draw_progress_bar(img: Image.Image, box: tuple[int, int, int, int], progress: float, color: tuple[int, int, int]) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    x1, y1, x2, y2 = box
    d.rounded_rectangle(box, radius=(y2 - y1) // 2, fill=(247, 224, 233, 220))
    fill_box = (x1, y1, int(x1 + (x2 - x1) * clamp(progress)), y2)
    d.rounded_rectangle(fill_box, radius=(y2 - y1) // 2, fill=(*color, 235))


def draw_chip(img: Image.Image, xy: tuple[int, int], text: str, color: tuple[int, int, int], alpha: float = 1.0) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    tw, th = text_size(d, text, FONTS["tiny"])
    x, y = xy
    rounded_rect(img, (x, y, x + tw + 32, y + 40), 20, (*color, int(36 * alpha)), outline=(*color, int(90 * alpha)))
    draw_text(img, (x + 16, y + 9), text, FONTS["tiny"], fill=color, anchor="la", alpha=alpha)


def draw_mock_browser(img: Image.Image, box: tuple[int, int, int, int], title: str, alpha: float = 1.0) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    rounded_rect(img, box, 34, (255, 255, 255, int(218 * alpha)), outline=(255, 255, 255, int(210 * alpha)), width=2, shadow=True)
    d = ImageDraw.Draw(img, "RGBA")
    d.rounded_rectangle((x1, y1, x2, y1 + 74), radius=34, fill=(255, 246, 249, int(235 * alpha)))
    d.rectangle((x1, y1 + 40, x2, y1 + 74), fill=(255, 246, 249, int(235 * alpha)))
    for i, c in enumerate([(244, 114, 140), (246, 180, 86), (94, 190, 145)]):
        d.ellipse((x1 + 34 + i * 30, y1 + 28, x1 + 48 + i * 30, y1 + 42), fill=(*c, int(230 * alpha)))
    draw_text(img, (x1 + 142, y1 + 26), title, FONTS["small"], fill=COLORS["muted"], alpha=alpha)
    return (x1 + 38, y1 + 104, x2 - 38, y2 - 38)


def base_with_room(t: float, blur: int = 1, dim: int = 58) -> Image.Image:
    room = cover(ASSETS / "room-bg.jpg", (W, H))
    if blur:
        room = room.filter(ImageFilter.GaussianBlur(blur))
    room = ImageEnhance.Color(room).enhance(1.04)
    overlay = Image.new("RGBA", (W, H), (255, 245, 248, dim))
    room.alpha_composite(overlay)
    vignette(room, 55)
    draw_petals(room, t, 0.28)
    return room


def draw_intro(t: float) -> Image.Image:
    scene = SCENES[0]
    p = scene.local(t)
    a = scene_alpha(t, scene)
    img = base_with_room(t, blur=2, dim=72)
    d = ImageDraw.Draw(img, "RGBA")

    logo = contain(ASSETS / "logo.png", (420, 420))
    logo_scale = 1.0 + 0.035 * math.sin(t * 2.2)
    logo = logo.resize((int(logo.width * logo_scale), int(logo.height * logo_scale)), Image.Resampling.LANCZOS)
    paste_alpha(img, logo, (W // 2 - logo.width // 2, 150 - int(20 * ease_out(p))), a)

    title_y = 604 + int((1 - ease_out(p)) * 30)
    draw_text(img, (W // 2, title_y), "QuestMind", FONTS["brand"], fill=COLORS["ink"], anchor="ma", alpha=a)
    draw_text(img, (W // 2, title_y + 126), "AI 陪伴式目标学习平台", FONTS["h3"], fill=COLORS["wine"], anchor="ma", alpha=a * 0.95)
    draw_text(img, (W // 2, title_y + 190), "把宏大的目标，拆成今天能完成的一步", FONTS["body"], fill=COLORS["muted"], anchor="ma", alpha=a * 0.95)

    for i, (txt, col) in enumerate([("目标分解", COLORS["sakura"]), ("AI 陪伴", COLORS["lavender"]), ("测验验证", COLORS["peach"])]):
        x = W // 2 - 270 + i * 270
        draw_chip(img, (x, 898), txt, col, a)

    d.rounded_rectangle((760, 838, 1160, 846), radius=4, fill=(*COLORS["gold"], int(110 * a)))
    return img


def draw_smart_create(t: float) -> Image.Image:
    scene = SCENES[1]
    p = scene.local(t)
    a = scene_alpha(t, scene)
    img = draw_gradient_background(t)
    draw_petals(img, t, 0.2)
    draw_scene_title(img, "01 / SMART GOAL", "AI 智能创建目标", "先了解现状，再生成子目标与每日任务。", t, scene)

    body = draw_mock_browser(img, (870, 112, 1762, 910), "QuestMind · Smart Create", a)
    bx1, by1, bx2, by2 = body

    card_y = by1
    rounded_rect(img, (bx1, card_y, bx2, card_y + 132), 22, (255, 255, 255, int(235 * a)), outline=(236, 180, 198, int(120 * a)))
    draw_text(img, (bx1 + 28, card_y + 26), "我想 30 天学完微观经济学", FONTS["body_bold"], fill=COLORS["ink"], alpha=a)
    draw_text(img, (bx1 + 28, card_y + 78), "每天可用 90 分钟，期末前完成复习。", FONTS["small"], fill=COLORS["muted"], alpha=a)

    q_reveal = smoothstep((p - 0.16) / 0.22)
    for i, q in enumerate(["目前最薄弱的章节是？", "每天更适合早上还是晚上学习？", "是否有教材、课件或笔记附件？"]):
        y = card_y + 170 + i * 78
        rounded_rect(img, (bx1, y, bx2 - 90, y + 54), 18, (255, 245, 249, int(220 * a * q_reveal)), outline=(238, 164, 188, int(80 * a * q_reveal)))
        draw_text(img, (bx1 + 24, y + 13), q, FONTS["small"], fill=COLORS["wine"], alpha=a * q_reveal)

    plan_reveal = smoothstep((p - 0.42) / 0.25)
    y0 = card_y + 438
    draw_text(img, (bx1, y0), "生成计划", FONTS["h3"], fill=COLORS["ink"], alpha=a * plan_reveal)
    plan = [("第 1-7 天", "需求、供给与弹性"), ("第 8-18 天", "消费者选择与成本"), ("第 19-30 天", "市场结构与综合测验")]
    for i, (day, desc) in enumerate(plan):
        y = y0 + 68 + i * 72
        rounded_rect(img, (bx1, y, bx2, y + 56), 18, (255, 255, 255, int(232 * a * plan_reveal)), outline=(226, 186, 215, int(110 * a * plan_reveal)))
        draw_text(img, (bx1 + 24, y + 12), day, FONTS["small"], fill=COLORS["sakura_dark"], alpha=a * plan_reveal)
        draw_text(img, (bx1 + 188, y + 12), desc, FONTS["small"], fill=COLORS["ink"], alpha=a * plan_reveal)

    alice = contain(ASSETS / "alice" / "alice-thinking.png", (370, 370))
    bob = int(10 * math.sin(t * 3.4))
    paste_alpha(img, alice, (610, 620 + bob), a * 0.95)
    bubble_alpha = smoothstep((p - 0.30) / 0.16) * a
    rounded_rect(img, (242, 598, 760, 760), 28, (255, 255, 255, int(230 * bubble_alpha)), outline=(238, 164, 188, int(120 * bubble_alpha)), shadow=True)
    draw_wrapped(img, (276, 632), "别急。先把目标变小，今天只需要完成第一步。", FONTS["body"], 440, fill=COLORS["ink"], alpha=bubble_alpha)
    return img


def draw_dashboard(t: float) -> Image.Image:
    scene = SCENES[2]
    p = scene.local(t)
    a = scene_alpha(t, scene)
    img = draw_gradient_background(t, warm=False)
    draw_scene_title(img, "02 / DASHBOARD", "目标、任务、陪伴同屏", "目标列表、学习详情与艾莉丝聊天组成一个清晰的行动中心。", t, scene)

    body = draw_mock_browser(img, (700, 116, 1790, 930), "QuestMind · Goals", a)
    bx1, by1, bx2, by2 = body
    col_gap = 24
    left_w = 290
    right_w = 310
    center_w = bx2 - bx1 - left_w - right_w - col_gap * 2
    x_left = bx1
    x_center = x_left + left_w + col_gap
    x_right = x_center + center_w + col_gap

    rounded_rect(img, (x_left, by1, x_left + left_w, by2), 22, (255, 255, 255, int(218 * a)), outline=(230, 190, 205, int(90 * a)))
    rounded_rect(img, (x_center, by1, x_center + center_w, by2), 22, (255, 255, 255, int(228 * a)), outline=(230, 190, 205, int(90 * a)))
    rounded_rect(img, (x_right, by1, x_right + right_w, by2), 22, (255, 255, 255, int(218 * a)), outline=(230, 190, 205, int(90 * a)))

    draw_text(img, (x_left + 24, by1 + 28), "学习目标", FONTS["small"], fill=COLORS["ink"], alpha=a)
    goals = [("微观经济学期末冲刺", 0.74, COLORS["sakura"]), ("React 项目实战", 0.48, COLORS["lavender"]), ("英语听力 30 天", 0.32, COLORS["peach"])]
    grow = smoothstep((p - 0.12) / 0.42)
    for i, (name, prog, col) in enumerate(goals):
        y = by1 + 86 + i * 142
        rounded_rect(img, (x_left + 18, y, x_left + left_w - 18, y + 112), 20, (255, 248, 250, int(230 * a)), outline=(*col, int(65 * a)))
        draw_text(img, (x_left + 40, y + 22), name, FONTS["tiny"], fill=COLORS["ink"], alpha=a)
        draw_progress_bar(img, (x_left + 40, y + 70, x_left + left_w - 42, y + 84), prog * grow, col)
        draw_text(img, (x_left + left_w - 74, y + 88), f"{int(prog * 100)}%", FONTS["tiny"], fill=col, alpha=a)

    draw_text(img, (x_center + 28, by1 + 28), "今日任务", FONTS["small"], fill=COLORS["ink"], alpha=a)
    tasks = [("复习需求弹性公式", "25 分钟", 0.92), ("完成 5 道选择题", "15 分钟", 0.62), ("整理错题卡", "20 分钟", 0.28)]
    for i, (name, duration, prog) in enumerate(tasks):
        y = by1 + 94 + i * 120
        rounded_rect(img, (x_center + 26, y, x_center + center_w - 26, y + 88), 18, (255, 255, 255, int(235 * a)), outline=(235, 196, 210, int(95 * a)))
        draw_text(img, (x_center + 58, y + 17), name, FONTS["small"], fill=COLORS["ink"], alpha=a)
        draw_text(img, (x_center + center_w - 150, y + 18), duration, FONTS["tiny"], fill=COLORS["muted"], alpha=a)
        draw_progress_bar(img, (x_center + 58, y + 58, x_center + center_w - 58, y + 70), prog * grow, COLORS["sakura"])

    guide_y = by1 + 488
    rounded_rect(img, (x_center + 26, guide_y, x_center + center_w - 26, by2 - 28), 22, (255, 245, 249, int(235 * a)), outline=(232, 153, 181, int(105 * a)))
    draw_text(img, (x_center + 58, guide_y + 28), "AI 学习指南", FONTS["small"], fill=COLORS["sakura_dark"], alpha=a)
    bullets = ["先复盘概念", "再做例题", "最后测验验证"]
    for i, item in enumerate(bullets):
        draw_text(img, (x_center + 74, guide_y + 86 + i * 48), f"• {item}", FONTS["small"], fill=COLORS["ink"], alpha=a)

    draw_text(img, (x_right + 26, by1 + 28), "艾莉丝", FONTS["small"], fill=COLORS["ink"], alpha=a)
    alice = contain(ASSETS / "alice" / "alice-happy.png", (210, 210))
    paste_alpha(img, alice, (x_right + 54, by1 + 80 + int(7 * math.sin(t * 3))), a)
    for i, msg in enumerate(["你今天的重点是弹性。", "先完成 25 分钟任务吧。", "做完我来帮你验收。"]):
        y = by1 + 316 + i * 92
        rounded_rect(img, (x_right + 26, y, x_right + right_w - 26, y + 62), 18, (255, 246, 249, int(238 * a)), outline=(236, 182, 199, int(80 * a)))
        draw_text(img, (x_right + 48, y + 17), msg, FONTS["tiny"], fill=COLORS["wine"], alpha=a)

    return img


def draw_focus(t: float) -> Image.Image:
    scene = SCENES[3]
    p = scene.local(t)
    a = scene_alpha(t, scene)
    img = base_with_room(t, blur=4, dim=86)
    draw_scene_title(img, "03 / DAILY FOCUS", "让每一天都有反馈", "计时、完成、奖励、连续学习，把坚持变成看得见的进步。", t, scene)

    card_alpha = a
    rounded_rect(img, (930, 158, 1680, 864), 42, (255, 255, 255, int(230 * card_alpha)), outline=(255, 255, 255, int(220 * card_alpha)), shadow=True)
    draw_text(img, (990, 226), "今日专注", FONTS["h2"], fill=COLORS["ink"], alpha=card_alpha)

    seconds = int(25 * 60 * smoothstep(p))
    mm = seconds // 60
    ss = seconds % 60
    draw_text(img, (1304, 388), f"{mm:02d}:{ss:02d}", FONTS["num"], fill=COLORS["sakura_dark"], anchor="ma", alpha=card_alpha)
    d = ImageDraw.Draw(img, "RGBA")
    center = (1304, 392)
    radius = 162
    d.ellipse((center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), outline=(244, 212, 225, int(235 * card_alpha)), width=22)
    d.arc((center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), -90, -90 + 360 * smoothstep(p), fill=(*COLORS["sakura"], int(245 * card_alpha)), width=22)

    tasks = [("复习需求弹性", "+15 金币", COLORS["green"]), ("生成今日摘要", "AI Guide", COLORS["lavender"]), ("完成速记卡", "3 张", COLORS["peach"])]
    for i, (name, tag, col) in enumerate(tasks):
        y = 626 + i * 68
        rounded_rect(img, (1014, y, 1596, y + 48), 18, (255, 247, 250, int(240 * a)), outline=(*col, int(75 * a)))
        d.ellipse((1038, y + 15, 1056, y + 33), fill=(*col, int(230 * a)))
        draw_text(img, (1076, y + 12), name, FONTS["tiny"], fill=COLORS["ink"], alpha=a)
        draw_text(img, (1474, y + 12), tag, FONTS["tiny"], fill=col, alpha=a)

    alice = contain(ASSETS / "alice" / "alice-proud.png", (500, 500))
    paste_alpha(img, alice, (560, 560 + int(8 * math.sin(t * 3.2))), a)
    bubble_alpha = smoothstep((p - 0.48) / 0.2) * a
    rounded_rect(img, (260, 612, 750, 790), 30, (255, 255, 255, int(226 * bubble_alpha)), outline=(232, 153, 181, int(120 * bubble_alpha)), shadow=True)
    draw_wrapped(img, (294, 650), "很好。奖励不是目的，它只是提醒你：你真的在前进。", FONTS["body"], 420, fill=COLORS["ink"], alpha=bubble_alpha)
    return img


def draw_quiz(t: float) -> Image.Image:
    scene = SCENES[4]
    p = scene.local(t)
    a = scene_alpha(t, scene)
    img = draw_gradient_background(t, warm=False)
    draw_petals(img, t, 0.18)
    draw_scene_title(img, "04 / MASTER CHECK", "资料、题目、测验闭环", "上传 PDF / DOCX / 图片，AI 提取上下文，生成子目标考核和最终测验。", t, scene)

    body = draw_mock_browser(img, (760, 110, 1740, 928), "QuestMind · Final Exam", a)
    bx1, by1, bx2, by2 = body
    d = ImageDraw.Draw(img, "RGBA")

    # Attachment stack
    for i, (name, col) in enumerate([("lecture.pdf", COLORS["blue"]), ("notes.docx", COLORS["lavender"]), ("diagram.png", COLORS["peach"])]):
        x = bx1 + 24 + i * 230
        y = by1 + 28
        rounded_rect(img, (x, y, x + 188, y + 122), 18, (255, 255, 255, int(235 * a)), outline=(*col, int(95 * a)), shadow=i == 0)
        d.rectangle((x + 28, y + 24, x + 76, y + 84), fill=(*col, int(190 * a)))
        d.polygon([(x + 76, y + 24), (x + 98, y + 46), (x + 76, y + 46)], fill=(255, 255, 255, int(170 * a)))
        draw_text(img, (x + 28, y + 92), name, FONTS["tiny"], fill=COLORS["ink"], alpha=a)

    reveal = smoothstep((p - 0.2) / 0.2)
    draw_text(img, (bx1 + 24, by1 + 210), "子目标考核验证", FONTS["h3"], fill=COLORS["ink"], alpha=a * reveal)
    question_y = by1 + 282
    rounded_rect(img, (bx1 + 24, question_y, bx2 - 24, question_y + 292), 26, (255, 255, 255, int(240 * a * reveal)), outline=(235, 196, 210, int(105 * a * reveal)), shadow=True)
    draw_wrapped(img, (bx1 + 62, question_y + 36), "如果需求价格弹性系数为 0，这意味着该商品是？", FONTS["body_bold"], bx2 - bx1 - 124, fill=COLORS["ink"], alpha=a * reveal)
    options = ["A. 完全富有弹性", "B. 单位弹性", "C. 完全缺乏弹性", "D. 富有弹性"]
    for i, opt in enumerate(options):
        y = question_y + 126 + i * 42
        col = COLORS["green"] if i == 2 and p > 0.58 else COLORS["muted"]
        draw_text(img, (bx1 + 84, y), opt, FONTS["small"], fill=col, alpha=a * reveal)

    result_alpha = smoothstep((p - 0.58) / 0.18) * a
    if result_alpha > 0.02:
        rounded_rect(img, (bx1 + 238, by2 - 130, bx2 - 238, by2 - 48), 28, (*COLORS["green"], int(36 * result_alpha)), outline=(*COLORS["green"], int(130 * result_alpha)))
        draw_text(img, ((bx1 + bx2) // 2, by2 - 106), "考核通过 · 掌握度 80%", FONTS["body_bold"], fill=COLORS["green"], anchor="ma", alpha=result_alpha)

    alice = contain(ASSETS / "alice" / "alice-surprised.png", (360, 360))
    paste_alpha(img, alice, (470, 650 + int(6 * math.sin(t * 3))), a)
    return img


def draw_room(t: float) -> Image.Image:
    scene = SCENES[5]
    p = scene.local(t)
    a = scene_alpha(t, scene)
    img = base_with_room(t, blur=0, dim=15)
    overlay = Image.new("RGBA", (W, H), (32, 16, 28, int(48 * a)))
    img.alpha_composite(overlay)

    alice = contain(ASSETS / "alice-character.png", (780, 780))
    paste_alpha(img, alice, (W // 2 - alice.width // 2, 250 + int(10 * math.sin(t * 2.2))), a)

    # GAL dialog box
    box = (210, 726, 1710, 980)
    rounded_rect(img, box, 30, (45, 30, 48, int(214 * a)), outline=(255, 225, 240, int(160 * a)), width=2, shadow=True)
    rounded_rect(img, (278, 690, 548, 756), 24, (*COLORS["wine"], int(230 * a)), outline=(*COLORS["gold"], int(190 * a)), width=2)
    draw_text(img, (318, 710), "艾莉丝", FONTS["h3"], fill=(255, 244, 235), alpha=a)

    line1 = "来访者，今天的任务已经整理好了。"
    line2 = "下一步很小，但它会把你带到真正想去的地方。"
    chars = int((len(line1) + len(line2)) * smoothstep((p - 0.14) / 0.62))
    shown1 = line1[: min(chars, len(line1))]
    shown2 = line2[: max(0, chars - len(line1))]
    draw_text(img, (300, 812), f"「{shown1}", FONTS["body_bold"], fill=(255, 246, 248), alpha=a)
    draw_text(img, (300, 872), f"{shown2}」", FONTS["body_bold"], fill=(255, 246, 248), alpha=a)

    draw_text(img, (128, 120), "05 / COMPANION ROOM", FONTS["small"], fill=(255, 235, 238), alpha=a)
    draw_text(img, (128, 176), "不只是工具，是有人陪你走下去", FONTS["h2"], fill=(255, 248, 242), alpha=a)
    return img


def draw_outro(t: float) -> Image.Image:
    scene = SCENES[6]
    p = scene.local(t)
    a = scene_alpha(t, scene)
    img = base_with_room(t, blur=5, dim=100)
    logo = contain(ASSETS / "logo.png", (330, 330))
    paste_alpha(img, logo, (W // 2 - logo.width // 2, 128 - int(18 * ease_out(p))), a)
    draw_text(img, (W // 2, 514), "QuestMind", FONTS["brand"], fill=COLORS["ink"], anchor="ma", alpha=a)
    draw_text(img, (W // 2, 642), "有人陪伴，有计划，有反馈", FONTS["h2"], fill=COLORS["wine"], anchor="ma", alpha=a)
    draw_text(img, (W // 2, 738), "把学习目标，变成每天都能抵达的下一步", FONTS["body"], fill=COLORS["muted"], anchor="ma", alpha=a)

    for i, text in enumerate(["AI 智能计划", "每日任务", "测验验证", "GAL 陪伴房间"]):
        x = W // 2 - 430 + i * 290
        draw_chip(img, (x, 852), text, [COLORS["sakura"], COLORS["peach"], COLORS["green"], COLORS["lavender"]][i], a)
    return img


def render_frame(t: float) -> Image.Image:
    for scene in SCENES:
        if scene.start <= t < scene.end or (t >= scene.end and scene is SCENES[-1]):
            if scene.name == "intro":
                return draw_intro(t)
            if scene.name == "smart":
                return draw_smart_create(t)
            if scene.name == "dashboard":
                return draw_dashboard(t)
            if scene.name == "focus":
                return draw_focus(t)
            if scene.name == "quiz":
                return draw_quiz(t)
            if scene.name == "room":
                return draw_room(t)
            if scene.name == "outro":
                return draw_outro(t)
    return draw_outro(t)


def encode_video() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg,
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-s",
        f"{W}x{H}",
        "-pix_fmt",
        "rgb24",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-movflags",
        "+faststart",
        str(OUT_FILE),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    total = int(DURATION * FPS)
    try:
        for frame_idx in range(total):
            t = frame_idx / FPS
            frame = render_frame(t).convert("RGB")
            if frame_idx == int(1.2 * FPS):
                frame.save(COVER_FILE)
            proc.stdin.write(frame.tobytes())
            if frame_idx % FPS == 0:
                print(f"rendered {frame_idx // FPS:02d}s / {int(DURATION)}s", flush=True)
    finally:
        proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise SystemExit(f"ffmpeg failed with exit code {rc}")


def main() -> None:
    os.environ.setdefault("IMAGEIO_FFMPEG_NO_PREVENT_SIGINT", "1")
    encode_video()
    print(f"\nVideo written to: {OUT_FILE}")
    print(f"Cover written to: {COVER_FILE}")


if __name__ == "__main__":
    main()
