import { useEffect, useRef, useState } from 'react';
import { ImageCropper } from './ImageCropper';
import { getSearchButtonLabel } from '../searchButtonLabel';
import {
  activeCrop,
  buildSearchSource,
  cropAfterFileChange,
  cropAfterModeChange,
  type SearchSourceMode,
} from '../searchSourceState';

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

export function SearchPanel({ top, onTopChange, loading, onSearch }: SearchPanelProps) {
  const [mode, setMode] = useState<SearchSourceMode>('upload');
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

  const hasImage = mode === 'upload' ? !!file : imageUrl.trim().length > 0;
  const canSearch = hasImage || textQuery.trim().length > 0;

  const chooseFile = (nextFile: File | null) => {
    setFile(nextFile);
    setCropBlob(cropAfterFileChange());
  };

  const chooseMode = (nextMode: SearchSourceMode) => {
    setCropBlob(current => cropAfterModeChange(mode, nextMode, current));
    setMode(nextMode);
  };

  const currentCrop = activeCrop(mode, file, cropBlob);

  const submit = () => {
    if (loading || !canSearch) return;
    onSearch(buildSearchSource({ mode, imageUrl, file, cropBlob, textQuery }));
  };

  return (
    <section className="panel search-panel" aria-labelledby="visual-search-title">
      <div className="panel-heading">
        <div>
          <h2 id="visual-search-title">Visual Search</h2>
          <span className="eyebrow">Upload, crop, match, refine</span>
        </div>
        <span className="environment-pill">Internal catalog</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Image source">
        <button
          type="button"
          className={mode === 'upload' ? 'tab active' : 'tab'}
          onClick={() => chooseMode('upload')}
          role="tab"
          aria-selected={mode === 'upload'}
        >
          Upload image
        </button>
        <button
          type="button"
          className={mode === 'url' ? 'tab active' : 'tab'}
          onClick={() => chooseMode('url')}
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
            id="internal-image-upload"
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          {!previewUrl && (
            <label
              className="dropzone"
              htmlFor="internal-image-upload"
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
            placeholder="https://example.com/image.jpg"
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
          placeholder="e.g. navy linen summer or a full celebrity name"
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
          {getSearchButtonLabel({ loading, cropActive: currentCrop !== null })}
        </button>
      </div>
      <p className="search-note">
        A text-only query is accepted only for one full celebrity name currently tagged in the index.
      </p>
    </section>
  );
}
