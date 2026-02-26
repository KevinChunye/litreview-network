interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({ children, className = '', hover = false }: CardProps) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 ${hover ? 'hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-lg transition-all duration-200' : ''} ${className}`}>
      {children}
    </div>
  );
}
