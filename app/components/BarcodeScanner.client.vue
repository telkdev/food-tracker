<script setup lang="ts">
/**
 * Camera barcode scanner. Uses the native BarcodeDetector where it exists (Android Chrome),
 * otherwise @zxing/browser (iOS Safari has no BarcodeDetector). Loaded lazily, only on this step.
 */
const emit = defineEmits<{ detected: [code: string] }>()
const { t } = useT()
const video = ref<HTMLVideoElement>()
const state = ref<'starting' | 'running' | 'error'>('starting')
let stop: (() => void) | null = null
let done = false

function found(code: string) {
  if (done || !/^\d{8,14}$/.test(code)) return
  done = true
  navigator.vibrate?.(30)
  stop?.()
  emit('detected', code)
}

onMounted(async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera')
    const constraints: MediaStreamConstraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }
    const BD = (window as any).BarcodeDetector
    if (BD) {
      const detector = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      video.value!.srcObject = stream
      await video.value!.play()
      state.value = 'running'
      let timer = 0
      const tick = async () => {
        if (done) return
        try {
          const codes = await detector.detect(video.value!)
          if (codes[0]?.rawValue) return found(codes[0].rawValue)
        }
        catch { /* frame not ready */ }
        timer = window.setTimeout(tick, 150)
      }
      tick()
      stop = () => { clearTimeout(timer); stream.getTracks().forEach(tr => tr.stop()) }
    }
    else {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
      const hints = new Map<any, any>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]])
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 })
      const controls = await reader.decodeFromConstraints(constraints, video.value!, (result) => {
        if (result) found(result.getText())
      })
      state.value = 'running'
      stop = () => controls.stop()
    }
  }
  catch {
    state.value = 'error'
  }
})
onBeforeUnmount(() => { done = true; stop?.() })
</script>

<template>
  <div class="scanner" :class="state">
    <video ref="video" muted playsinline autoplay />
    <div v-if="state !== 'error'" class="frame" aria-hidden="true"><span /></div>
    <p class="msg">{{ state === 'error' ? t('cameraUnavailable') : t('scanHint') }}</p>
  </div>
</template>

<style scoped>
.scanner { position: relative; aspect-ratio: 4 / 3; border-radius: var(--r-lg); overflow: hidden; background: #0d0c0b; display: grid; place-items: center; }
.scanner.error { aspect-ratio: auto; min-height: 120px; background: var(--surface-2); }
video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.error video { display: none; }
.frame { position: absolute; inset: 22% 12%; border: 2px solid rgba(255, 255, 255, .85); border-radius: var(--r-md); box-shadow: 0 0 0 999px rgba(0, 0, 0, .35); }
.frame span { position: absolute; left: 6%; right: 6%; top: 50%; height: 2px; background: #ff5a3c; animation: scan 1.6s ease-in-out infinite alternate; }
@keyframes scan { from { transform: translateY(-30px); } to { transform: translateY(30px); } }
.msg { position: absolute; bottom: var(--s-3); left: 0; right: 0; text-align: center; color: #fff; font-size: var(--fs-sm); padding: 0 var(--s-4); }
.error .msg { position: static; color: var(--ink-2); }
</style>
