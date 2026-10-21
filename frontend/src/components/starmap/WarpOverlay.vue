<template>
  <Teleport to="body">
    <div
      v-if="active"
      class="warp-mask"
      :class="{ 'is-leaving': leaving }"
      role="status"
      aria-live="polite"
      aria-label="正在进入知识宇宙"
    >
      <div class="warp-nebula" aria-hidden="true"></div>
      <div class="warp-rings" aria-hidden="true">
        <i class="r1"></i><i class="r2"></i><i class="r3"></i>
      </div>
      <div class="warp-core" aria-hidden="true"></div>
      <i class="warp-comet c1" aria-hidden="true"></i>
      <i class="warp-comet c2" aria-hidden="true"></i>
      <span v-for="s in stars" :key="s.i" class="warp-star" :style="s.style" aria-hidden="true"></span>
      <div class="warp-copy">
        <p class="warp-title">正在穿越知识星海</p>
        <p class="warp-sub">KNOWLEDGE UNIVERSE</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { active, leaving } from '../../starmap/warp.js'

const stars = Array.from({ length: 64 }, (_, idx) => {
  const i = idx + 1
  return {
    i,
    style: {
      '--a': `${(i * 137.508) % 360}deg`,
      '--dist': `${220 + (i % 9) * 92}px`,
      '--delay': `${-(i % 23) * 0.08}s`,
      '--dur': `${1.35 + (i % 7) * 0.17}s`,
      '--len': `${13 + (i % 5) * 11}px`,
      '--w': `${i % 11 === 0 ? 2.3 : 1.15}px`
    }
  }
})
</script>

<style scoped>
.warp-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 50% 46%, rgba(56, 189, 248, .18), transparent 30%),
    radial-gradient(ellipse at 50% 50%, rgba(124, 58, 237, .19), transparent 56%),
    radial-gradient(ellipse at 50% 120%, rgba(14, 165, 233, .12), transparent 50%),
    #02030a;
  opacity: 1;
  transition: opacity .52s ease, transform .52s ease;
}
.warp-mask *, .warp-mask { pointer-events: none; }
.warp-mask.is-leaving { opacity: 0; transform: scale(1.025); }

.warp-nebula {
  position: absolute;
  inset: -24%;
  background:
    conic-gradient(from 30deg at 50% 50%,
      transparent 0deg,
      rgba(56, 189, 248, .10) 55deg,
      transparent 115deg,
      rgba(167, 139, 250, .12) 185deg,
      transparent 250deg,
      rgba(34, 211, 238, .09) 310deg,
      transparent 360deg);
  filter: blur(46px);
  animation: warpNebula 26s linear infinite;
}

.warp-rings { position: absolute; inset: 0; }
.warp-rings i {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 96px;
  height: 96px;
  margin: -48px 0 0 -48px;
  border-radius: 50%;
  border: 1px solid rgba(125, 211, 252, .34);
  box-shadow: 0 0 34px rgba(56, 189, 248, .10), inset 0 0 26px rgba(167, 139, 250, .10);
  opacity: 0;
  animation: warpRing 2.6s cubic-bezier(.18, .62, .28, 1) infinite;
}
.warp-rings .r2 { animation-delay: .55s; border-color: rgba(167, 139, 250, .3); }
.warp-rings .r3 { animation-delay: 1.1s; border-color: rgba(125, 211, 252, .22); }

.warp-core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 50%;
  background: #e0f2fe;
  box-shadow:
    0 0 16px 6px rgba(125, 211, 252, .55),
    0 0 58px 18px rgba(124, 58, 237, .35),
    0 0 140px 42px rgba(56, 189, 248, .18);
  animation: warpCore 2.2s ease-in-out infinite;
}

.warp-star {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--w, 1.15px);
  height: var(--len, 16px);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(240, 249, 255, .98), rgba(125, 211, 252, .40) 45%, transparent);
  transform-origin: 50% 0;
  opacity: 0;
  animation: warpStar var(--dur, 1.8s) linear var(--delay, 0s) infinite;
  will-change: transform, opacity;
}

.warp-comet {
  position: absolute;
  width: 230px;
  height: 1.4px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(186, 230, 253, .95), rgba(167, 139, 250, .5), transparent);
  opacity: 0;
  filter: blur(.2px);
  animation: warpComet 3.2s ease-in-out infinite;
}
.warp-comet.c1 { left: 8%; top: 27%; transform: rotate(-24deg); animation-delay: .4s; }
.warp-comet.c2 { right: 4%; bottom: 23%; transform: rotate(154deg); animation-delay: 1.6s; }

.warp-copy {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(50% + 74px);
  text-align: center;
  animation: warpCopy .8s ease-out both;
}
.warp-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: .36em;
  color: #e0f2fe;
  text-shadow: 0 0 18px rgba(125, 211, 252, .65);
}
.warp-sub {
  margin: 9px 0 0;
  font-family: var(--font-display);
  font-size: 8px;
  letter-spacing: .48em;
  color: rgba(125, 211, 252, .62);
}

.warp-mask::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(1, 2, 8, .62) 100%);
}

@keyframes warpNebula { to { transform: rotate(360deg); } }
@keyframes warpStar {
  0% { opacity: 0; transform: rotate(var(--a, 0deg)) translateY(12px) scaleY(.22); }
  14% { opacity: .95; }
  100% { opacity: 0; transform: rotate(var(--a, 0deg)) translateY(var(--dist, 320px)) scaleY(2.5); }
}
@keyframes warpRing {
  0% { transform: scale(.28); opacity: 0; }
  18% { opacity: .55; }
  100% { transform: scale(2.9); opacity: 0; }
}
@keyframes warpCore {
  0%, 100% { transform: scale(.82); opacity: .78; }
  50% { transform: scale(1.25); opacity: 1; }
}
@keyframes warpComet {
  0% { opacity: 0; translate: -70px 34px; }
  22% { opacity: .85; }
  70% { opacity: .5; }
  100% { opacity: 0; translate: 150px -40px; }
}
@keyframes warpCopy {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .warp-mask { display: none; }
  .warp-mask * { animation: none !important; }
}
</style>
