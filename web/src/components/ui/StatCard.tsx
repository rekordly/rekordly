import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import clsx from 'clsx';
import { ReactNode } from 'react';

interface StatCardProps {
  tag: string;
  tagColor?: 'primary' | 'secondary';
  title: string;
  description?: string;
  icon?: ReactNode;
  gradient?: boolean;
  gradientColor?: 'primary' | 'secondary';
  compact?: boolean; // New prop for reduced padding
  border?: boolean; // New prop to add border
  className?: string; // Custom className
}

export default function StatCard({
  tag,
  tagColor = 'primary',
  title,
  description,
  icon,
  gradient = false,
  gradientColor = 'primary',
  compact = false,
  border = false,
  className = '',
}: StatCardProps) {
  const getGradientClasses = () => {
    if (!gradient) return '';

    const gradientMap = {
      primary:
        'bg-gradient-to-b dark:from-primary-800/40 from-primary-100/25 dark:to-[#131219] to-white from-0% via-50% to-90%',
      secondary:
        'bg-gradient-to-b dark:from-secondary-800/40 from-secondary-100/25 dark:to-[#131219] to-white from-0% via-50% to-90%',
    };

    return gradientMap[gradientColor];
  };

  return (
    <Card
      className={clsx(
        'bg-gradient-to-b relative rounded-3xl',
        compact ? 'p-2' : 'p-3',
        gradient ? getGradientClasses() : '',
        border && 'border-2 border-default-200',
        className
      )}
      shadow="none"
    >
      {tag && (
        <CardHeader className={compact ? 'pb-1' : ''}>
          <Chip
            className={clsx(
              'uppercase',
              compact ? 'p-2 h-6 text-[0.65rem]' : 'p-3'
            )}
            color={tagColor}
            size="sm"
            variant="flat"
          >
            {tag}
          </Chip>
        </CardHeader>
      )}

      <CardBody className={compact ? 'py-3' : 'py-6 md:pt-8'}>
        <div
          className={clsx(
            'flex md:justify-between gap-4',
            icon ? 'flex-row-reverse' : 'flex-col'
          )}
        >
          {icon && (
            <div className="flex-3/12 mb-2 md:mb-0">
              <Chip
                className={clsx(
                  'item-center rounded-2xl',
                  compact ? 'size-12' : 'size-16'
                )}
                color={tagColor}
                size={compact ? 'md' : 'lg'}
                variant="shadow"
              >
                {icon}
              </Chip>
            </div>
          )}

          <div className="flex-9/12">
            <h2
              className={clsx(
                'font-heading tracking-tight font-bold',
                compact ? 'text-lg md:text-xl' : 'text-2xl'
              )}
            >
              {title}
            </h2>
            {description && (
              <p
                className={clsx(
                  'font-light',
                  compact ? 'text-[0.65rem]' : 'text-xs'
                )}
              >
                {description}
              </p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
