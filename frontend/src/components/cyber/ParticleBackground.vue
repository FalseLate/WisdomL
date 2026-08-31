<template>
  <div ref="containerRef" class="particle-container" :class="{ loaded: isLoaded }"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const containerRef = ref(null)
const isLoaded = ref(false)
let particlesInstance = null

onMounted(() => {
  if (window.tsParticles && containerRef.value) {
    initParticles()
  } else {
    const check = setInterval(() => {
      if (window.tsParticles && containerRef.value) {
        clearInterval(check)
        initParticles()
      }
    }, 100)
    setTimeout(() => clearInterval(check), 10000)
  }
})

function initParticles() {
  window.tsParticles.load(containerRef.value, {
    particles: {
      number: {
        value: 65,
        density: { enable: true, value_area: 800 }
      },
      color: {
        value: ['#00f5ff', '#ff00ff', '#00ff88']
      },
      shape: {
        type: 'circle'
      },
      opacity: {
        value: 0.35,
        random: true,
        anim: {
          enable: true,
          speed: 0.8,
          opacity_min: 0.1,
          sync: false
        }
      },
      size: {
        value: 2,
        random: true
      },
      line_linked: {
        enable: true,
        distance: 120,
        color: '#00f5ff',
        opacity: 0.1,
        width: 1
      },
      move: {
        enable: true,
        speed: 0.9,
        direction: 'none',
        random: true,
        straight: false,
        out_mode: 'out',
        bounce: false,
        attract: {
          enable: false,
          rotateX: 600,
          rotateY: 1200
        }
      }
    },
    interactivity: {
      detect_on: 'canvas',
      events: {
        onhover: {
          enable: true,
          mode: 'grab'
        },
        onclick: {
          enable: true,
          mode: 'push'
        },
        resize: true
      },
      modes: {
        grab: {
          distance: 140,
          line_linked: {
            opacity: 0.3
          }
        },
        push: {
          particles_nb: 3
        }
      }
    },
    retina_detect: true,
    fps_limit: 60
  }).then(container => {
    particlesInstance = container
    // 等第一帧渲染完成后再淡入，避免初始化卡顿
    requestAnimationFrame(() => {
      setTimeout(() => {
        isLoaded.value = true
      }, 100)
    })
  }).catch(err => {
    console.warn('粒子初始化失败:', err)
    isLoaded.value = true
  })
}

onUnmounted(() => {
  if (particlesInstance) {
    particlesInstance.destroy()
    particlesInstance = null
  }
})
</script>

<style scoped>
.particle-container {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.8s ease;
}

.particle-container.loaded {
  opacity: 1;
}

.particle-container :deep(canvas) {
  display: block;
}
</style>
