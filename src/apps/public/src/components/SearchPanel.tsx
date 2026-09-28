import { useEffect, useRef, useState } from 'react';
import { ImageCropper } from './ImageCropper';

interface SearchPanelProps {
  top: number;
  onTopChange: (top: number) => void;
  loading: boolean;
  onSearch: (source: {
    imageUrl?: string;
    imageFile?: Blob;
    cropFile?: Blob;
    textQuery?: string;
  }) => void;
}

type Mode = 'upload' | 'url';

export function SearchPanel({ top, onTopChange, loading, onSearch }: SearchPanelProps) {
  const [mode, setMode] = useState<Mode>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropBlob, setCropBlob] = useState<Blob | null>(null);
  const [textQuery, setTextQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const canSearch = mode === 'upload' ? !!file : imageUrl.trim().length > 0;

  const chooseFile = (nextFile: File | null) => {
    setFile(nextFile);
    setCropBlob(null);
  };

  const submit = () => {
    if (loading || !canSearch) return;
    if (mode === 'url') {
      onSearch({ imageUrl: imageUrl.trim(), textQuery: textQuery.trim() || undefined });
    } else if (file) {
      onSearch(
        cropBlob
          ? { cropFile: cropBlob, textQuery: textQuery.trim() || undefined }
          : { imageFile: file, textQuery: textQuery.trim() || undefined },
      );
    }
  };

  return (
    <section className="panel search-panel" aria-labelledby="visual-search-title">
      <div className="panel-heading">
        <div>
          <h2 id="visual-search-title">Visual Search</h2>
          <span className="eyebrow">Upload, crop, match, refine</span>
        </div>
        <span className="step-pill">Catalog</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Image source">
        <button
          type="button"
          className={mode === 'upload' ? 'tab active' : 'tab'}
          onClick={() => setMode('upload')}
          role="tab"
          aria-selected={mode === 'upload'}
        >
          Upload image
        </button>
        <button
          type="button"
          className={mode === 'url' ? 'tab active' : 'tab'}
          onClick={() => setMode('url')}
          role="tab"
          aria-selected={mode === 'url'}
        >
          Image URL
        </button>
      </div>

      {mode === 'upload' ? (
        <div className="upload">
          <input
            ref={fileInput}
            id="public-image-upload"
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          {!previewUrl && (
            <label
              className="dropzone"
              htmlFor="public-image-upload"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                chooseFile(event.dataTransfer.files.item(0));
              }}
            >
              <span className="dropzone-icon" aria-hidden="true">↥</span>
              <strong>Drop a campaign, product, or street-style image</strong>
              <span>Choose an image to preview and crop before search</span>
            </label>
          )}
          {file && (
            <div className="file-summary">
              <span className="file-name">{file.name}</span>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  chooseFile(null);
                  if (fileInput.current) fileInput.current.value = '';
                }}
              >
                Remove
              </button>
            </div>
          )}
          {previewUrl && <ImageCropper src={previewUrl} onCropChange={setCropBlob} />}
        </div>
      ) : (
        <label className="field url-input">
          <span>Image URL</span>
          <input
            type="url"
            placeholder="https://example.com/photo.jpg"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
          />
        </label>
      )}

      <label className="field text-refinement">
        <span>Refine the look <em>Optional</em></span>
        <input
          type="text"
          maxLength={500}
          placeholder="e.g. navy linen for summer"
          value={textQuery}
          onChange={(event) => setTextQuery(event.target.value)}
        />
      </label>

      <div className="controls">
        <label className="field result-limit">
          <span>Result count</span>
          <input
            type="number"
            min={1}
            max={50}
            value={top}
            onChange={(event) => onTopChange(Number(event.target.value) || 10)}
          />
        </label>
        <button type="button" className="primary" disabled={loading || !canSearch} onClick={submit}>
          {loading ? 'Searching…' : cropBlob ? 'Search selected area' : 'Find similar'}
        </button>
      </div>
      <p className="privacy-note">Your image is used only to find visually similar catalog pieces.</p>
    </section>
  );
}
