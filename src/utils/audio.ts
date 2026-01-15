// Procedural Audio Engine for Todry
// Generates lightweight, premium UI sounds using Web Audio API

let audioContext: AudioContext | null = null

const getContext = () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioContext
}

// Helper to create a smooth gain envelope
const createEnvelope = (param: AudioParam, now: number, duration: number) => {
    param.setValueAtTime(0, now)
    param.linearRampToValueAtTime(1, now + 0.01)
    param.exponentialRampToValueAtTime(0.001, now + duration)
}

export const playPop = () => {
    const ctx = getContext()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, now)
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1)

    createEnvelope(gain.gain, now, 0.1)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.1)
}

export const playSuccess = () => {
    const ctx = getContext()
    const now = ctx.currentTime

    const playNote = (freq: number, delay: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq

        // Smooth custom envelope for "glassy" sound
        gain.gain.setValueAtTime(0, now + delay)
        gain.gain.linearRampToValueAtTime(0.2, now + delay + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.6)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + delay)
        osc.stop(now + delay + 0.6)
    }

    // C Major Triad (C5, E5, G5) + High C6 for sparkle
    playNote(523.25, 0)
    playNote(659.25, 0.08)
    playNote(783.99, 0.16)
    playNote(1046.50, 0.24)
}

export const playDelete = () => {
    const ctx = getContext()
    const now = ctx.currentTime

    // Noise buffer for "crumple" effect
    const bufferSize = ctx.sampleRate * 0.2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1000, now)
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.2)

    const gain = ctx.createGain()
    createEnvelope(gain.gain, now, 0.2)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + 0.2)
}

export const playClick = () => {
    const ctx = getContext()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1200, now)

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.1, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.03)
}
