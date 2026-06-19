import { useState, useEffect, useRef, useCallback } from 'react';
import { HiOutlineChevronDown, HiOutlineSearch, HiOutlineX } from 'react-icons/hi';

export default function MultiSelect({
  id,
  options = [],
  selected = [],
  onChange,
  placeholder = 'Chọn...',
  labelPrefix = '',
  className = '',
  searchable = true,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  // Tính toán vị trí dropdown theo viewport (position:fixed)
  // để tránh bị clip bởi overflow:hidden/auto của parent container (e.g. scrollable table)
  const calcDropdownPos = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 280; // ước tính max-height
    const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    setDropdownStyle({
      position: 'fixed',
      left: Math.min(rect.left, window.innerWidth - 292), // tránh tràn sang phải
      width: Math.max(rect.width, 288), // min 288px
      zIndex: 9999,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      calcDropdownPos();
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setSearch('');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        // Kiểm tra thêm xem click có nằm trong dropdown (fixed) không
        const dropdowns = document.querySelectorAll('[data-multiselect-dropdown]');
        for (const el of dropdowns) {
          if (el.contains(event.target)) return;
        }
        setIsOpen(false);
        setSearch('');
      }
    }
    function handleScroll() {
      calcDropdownPos(); // cập nhật vị trí khi scroll
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', calcDropdownPos);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', calcDropdownPos);
    };
  }, [isOpen, calcDropdownPos]);

  const toggleOption = (val) => {
    const isSelected = selected.includes(val);
    const newSelected = isSelected
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    onChange(newSelected);
  };

  const handleSelectAll = () => {
    const allValues = filteredOptions.map(opt => opt.value);
    const allFilteredSelected = filteredOptions.every(opt => selected.includes(opt.value));
    if (allFilteredSelected) {
      onChange(selected.filter(val => !allValues.includes(val)));
    } else {
      onChange([...new Set([...selected, ...allValues])]);
    }
  };

  const handleClear = () => {
    onChange([]);
  };

  const filteredOptions = options.filter((opt) =>
    (opt.label || opt.value || '').toString().toLowerCase().includes(search.toLowerCase())
  );

  const getButtonText = () => {
    if (selected.length === 0) return placeholder;
    const selectedLabels = selected
      .map((val) => {
        const opt = options.find((o) => o.value === val);
        return opt ? opt.label : val;
      })
      .filter(Boolean);
    const prefix = labelPrefix ? `${labelPrefix}: ` : '';
    if (selectedLabels.length <= 2) {
      const cleanLabels = selectedLabels.map(l => l.split(' — ')[0]);
      return `${prefix}${cleanLabels.join(', ')}`;
    }
    return `${prefix}${selectedLabels.length} đã chọn`;
  };

  const isAllSelected = filteredOptions.length > 0 && filteredOptions.every(opt => selected.includes(opt.value));

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef} id={id}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={`flex items-center justify-between w-full bg-white dark:bg-surface-800/80 border border-surface-200 dark:border-surface-700/50 rounded-xl px-4 py-2 text-sm text-surface-800 dark:text-surface-100 hover:border-surface-300 dark:hover:border-surface-600 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 transition-all duration-150 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${
          selected.length > 0 ? 'border-primary-500 dark:border-primary-500/80 bg-primary-50/10 dark:bg-primary-500/5 text-primary-700 dark:text-primary-400 font-semibold' : ''
        }`}
      >
        <span className="truncate pr-2 text-left">
          {getButtonText()}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selected.length > 0 && !disabled && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-0.5 rounded-full hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
            >
              <HiOutlineX className="w-3.5 h-3.5" />
            </span>
          )}
          <HiOutlineChevronDown className={`w-4 h-4 text-surface-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div
          data-multiselect-dropdown="true"
          style={dropdownStyle}
          className="rounded-xl bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/50 shadow-xl animate-fade-in overflow-hidden"
        >
          {searchable && options.length > 5 && (
            <div className="p-2.5 border-b border-surface-100 dark:border-surface-700/50 relative">
              <HiOutlineSearch className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-all"
              />
            </div>
          )}

          <div className="flex items-center justify-between px-3 py-2 bg-surface-50/50 dark:bg-surface-900/30 border-b border-surface-100 dark:border-surface-700/50 text-xs">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-primary-600 dark:text-primary-400 font-semibold hover:underline"
            >
              {isAllSelected ? 'Bỏ chọn hết' : 'Chọn tất cả'}
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="text-red-500 hover:underline font-semibold"
              >
                Xóa chọn
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="text-xs text-surface-400 py-3 text-center">Không tìm thấy kết quả</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSel = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-sm hover:bg-surface-50 dark:hover:bg-surface-700/40 select-none ${
                      isSel ? 'text-primary-600 dark:text-primary-400 font-semibold bg-primary-50/30 dark:bg-primary-500/5' : 'text-surface-700 dark:text-surface-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleOption(opt.value)}
                      className="rounded border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500/40 w-4 h-4 transition-all"
                    />
                    <span className="truncate">{opt.label || opt.value}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
