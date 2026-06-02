import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  pages: number
  onPageChange: (page: number) => void
}

function Pagination({ page, pages, onPageChange }: PaginationProps) {
  if (pages <= 1) return null

  const getPageNumbers = () => {
    const pageNumbers = []
    const maxVisible = 5

    if (pages <= maxVisible) {
      for (let i = 1; i <= pages; i++) {
        pageNumbers.push(i)
      }
    } else {
      if (page <= 3) {
        for (let i = 1; i <= maxVisible; i++) {
          pageNumbers.push(i)
        }
        pageNumbers.push('...')
        pageNumbers.push(pages)
      } else if (page >= pages - 2) {
        pageNumbers.push(1)
        pageNumbers.push('...')
        for (let i = pages - maxVisible + 1; i <= pages; i++) {
          pageNumbers.push(i)
        }
      } else {
        pageNumbers.push(1)
        pageNumbers.push('...')
        for (let i = page - 1; i <= page + 1; i++) {
          pageNumbers.push(i)
        }
        pageNumbers.push('...')
        pageNumbers.push(pages)
      }
    }

    return pageNumbers
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-sm)',
      padding: 'var(--space-md)',
      borderTop: '1px solid var(--border-primary)'
    }}>
      <button
        className="btn btn-sm btn-secondary"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>

      {getPageNumbers().map((num, idx) => (
        num === '...' ? (
          <span key={idx} style={{ padding: 'var(--space-sm)', color: 'var(--text-tertiary)' }}>{num}</span>
        ) : (
          <button
            key={idx}
            className={`btn btn-sm ${num === page ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onPageChange(num as number)}
            disabled={num === page}
          >
            {num}
          </button>
        )
      ))}

      <button
        className="btn btn-sm btn-secondary"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

export default Pagination
