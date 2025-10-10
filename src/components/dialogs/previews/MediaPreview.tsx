import { useState, useRef, useEffect } from 'react'
import { Icons } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'

interface MediaPreviewProps {
  url: string
  fileName: string
  type: 'audio' | 'video'
}

export function MediaPreview({ url, fileName, type }: MediaPreviewProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    const handleTimeUpdate = () => setCurrentTime(media.currentTime)
    const handleDurationChange = () => setDuration(media.duration)
    const handleEnded = () => setIsPlaying(false)
    const handleError = () => setError('Failed to load media file')

    media.addEventListener('timeupdate', handleTimeUpdate)
    media.addEventListener('durationchange', handleDurationChange)
    media.addEventListener('ended', handleEnded)
    media.addEventListener('error', handleError)

    return () => {
      media.removeEventListener('timeupdate', handleTimeUpdate)
      media.removeEventListener('durationchange', handleDurationChange)
      media.removeEventListener('ended', handleEnded)
      media.removeEventListener('error', handleError)
    }
  }, [])

  const togglePlayPause = () => {
    const media = mediaRef.current
    if (!media) return

    if (isPlaying) {
      media.pause()
    } else {
      media.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const media = mediaRef.current
    if (!media) return

    const newTime = parseFloat(e.target.value)
    media.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const media = mediaRef.current
    if (!media) return

    const newVolume = parseFloat(e.target.value)
    media.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }

  const toggleMute = () => {
    const media = mediaRef.current
    if (!media) return

    media.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Icons.error className="h-12 w-12 mx-auto mb-2 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[400px] bg-muted/20 rounded-lg overflow-hidden flex flex-col">
      {/* Media Element */}
      <div className="flex-1 flex items-center justify-center p-6">
        {type === 'video' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={url}
            className="max-w-full max-h-full rounded-lg shadow-lg"
            controls={false}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-4">
            <Icons.music className="h-32 w-32 text-muted-foreground" />
            <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={url} />
            <p className="text-sm font-medium">{fileName}</p>
          </div>
        )}
      </div>

      {/* Custom Controls */}
      <div className="bg-background/95 border-t px-6 py-4">
        {/* Timeline */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs text-muted-foreground min-w-[40px]">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          />
          <span className="text-xs text-muted-foreground min-w-[40px] text-right">
            {formatTime(duration)}
          </span>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <Button
              size="sm"
              variant="ghost"
              onClick={togglePlayPause}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Icons.pause className="h-5 w-5" />
              ) : (
                <Icons.play className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <Icons.volumeX className="h-4 w-4" />
              ) : (
                <Icons.volume className="h-4 w-4" />
              )}
            </Button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
