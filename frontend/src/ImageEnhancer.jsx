import { useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/tiff'

/** Ensure we only ever use blob: object URLs as image sources to prevent XSS. */
function safeBlobUrl(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) return url
  return ''
}

export default function ImageEnhancer() {
  const fileInputRef = useRef(null)
  const [preview, setPreview] = useState(null)       // original preview URL
  const [enhanced, setEnhanced] = useState(null)     // enhanced image URL
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    setEnhanced(null)
    setFileName(file.name)
    setPreview(URL.createObjectURL(file))
  }

  const handleEnhance = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Please select an image first.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch(`${API_BASE}/enhance-image`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Enhancement failed' }))
        throw new Error(body.error || 'Enhancement failed')
      }

      const blob = await response.blob()
      setEnhanced(URL.createObjectURL(blob))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!enhanced) return
    const a = document.createElement('a')
    a.href = enhanced
    // The backend always returns a JPEG; strip original extension to avoid
    // doubles like "photo.png.jpg".
    const baseName = (fileName || 'photo').replace(/\.[^.]+$/, '')
    a.download = `enhanced-${baseName}.jpg`
    a.click()
  }

  const handleReset = () => {
    setPreview(null)
    setEnhanced(null)
    setError('')
    setFileName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <section className="panel">
      <h2>📷 DSLR Image Enhancer</h2>
      <p className="enhancer-description">
        Upload a photo to apply DSLR-quality enhancements: sharpening, contrast &amp; colour
        boost, and a natural bokeh background blur.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="enhancer-upload">
        <label className="file-label">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            onChange={handleFileChange}
            className="file-input"
          />
          <span className="file-button">Choose Image</span>
          <span className="file-name">{fileName || 'No file chosen'}</span>
        </label>

        <div className="enhancer-actions">
          <button type="button" onClick={handleEnhance} disabled={!preview || loading}>
            {loading ? 'Enhancing…' : '✨ Enhance'}
          </button>
          {(preview || enhanced) && (
            <button type="button" className="secondary" onClick={handleReset}>
              Reset
            </button>
          )}
          {enhanced && (
            <button type="button" className="secondary" onClick={handleDownload}>
              ⬇ Download
            </button>
          )}
        </div>
      </div>

      {(preview || enhanced) && (
        <div className="enhancer-compare">
          {preview && (
            <div className="enhancer-card">
              <span className="enhancer-label">Original</span>
              <img src={safeBlobUrl(preview)} alt="Original" className="enhancer-img" />
            </div>
          )}
          {enhanced && (
            <div className="enhancer-card">
              <span className="enhancer-label enhanced-label">DSLR Enhanced ✨</span>
              <img src={safeBlobUrl(enhanced)} alt="DSLR Enhanced" className="enhancer-img" />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
