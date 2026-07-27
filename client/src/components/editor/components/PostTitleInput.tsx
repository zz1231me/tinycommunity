// client/src/components/editor/PostTitleInput.tsx - 인라인 스타일로 확실하게
import React from 'react';

interface PostTitleInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
}

const PostTitleInput: React.FC<PostTitleInputProps> = ({ value, onChange, maxLength }) => {
  // ✅ Defensive: Ensure value is never undefined
  const safeValue = value ?? '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= maxLength) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor="title"
        className="block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        제목
      </label>

      <div className="relative">
        <input
          id="title"
          type="text"
          style={{
            width: '100%',
            padding: '0.75rem 5rem 0.75rem 1rem',
            border: '1px solid rgb(209 213 219)',
            borderRadius: '0.5rem',
            backgroundColor: 'white',
            color: 'rgb(17 24 39)',
            fontSize: '1.125rem',
            fontWeight: '600',
            outline: 'none',
          }}
          className="dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          value={safeValue}
          onChange={handleChange}
          placeholder="제목을 입력하세요"
          required
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400 pointer-events-none">
          {safeValue.length}/{maxLength}
        </div>
      </div>
    </div>
  );
};

export default PostTitleInput;
