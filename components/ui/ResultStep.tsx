import Spinner from '@/components/ui/Spinner';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';

interface ResultStepProps {
  loading?: boolean;
  loadingText?: string;
  error?: string | null;
  result?: string | null;
  onClose?: () => void;
}

export default function ResultStep({
  loading,
  loadingText = 'Processing...',
  error,
  result,
  onClose,
}: ResultStepProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center py-8 gap-4">
        <Spinner />
        <p className="text-sm text-gray-600">{loadingText}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="error">{error}</Alert>
        {onClose && (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (result) {
    return (
      <div className="space-y-4">
        <Alert variant="success">{result}</Alert>
        {onClose && (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    );
  }
  return null;
}
