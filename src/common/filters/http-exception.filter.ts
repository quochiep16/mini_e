import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorText = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        message = resp;
      } else if (resp && typeof resp === 'object') {
        const r: any = resp;
        message = r.message ?? message;           // có thể là string hoặc array (từ ValidationPipe)
        errorText = r.error ?? errorText;         // ví dụ: 'Bad Request', 'Conflict'
      }
    } else if (exception instanceof QueryFailedError) {
      // Phòng trường hợp bạn không map duplicate trong service
      const code = (exception as any).code ?? (exception as any).errno;
      if (code === 'ER_DUP_ENTRY' || code === 1062 || code === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'Email đã tồn tại';
        errorText = 'Conflict';
      }
    } else if (exception?.message) {
      message = exception.message;
    }

    // Chuẩn hoá message (nếu là mảng từ ValidationPipe thì lấy phần tử đầu)
    if (Array.isArray(message)) message = message[0];

    // Nếu chưa có errorText, derive từ status
    if (!errorText || errorText === 'Internal Server Error') {
      const s: any = HttpStatus[status];
      if (s) errorText = s.toLowerCase().split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    }

    res.status(status).json({
      success: false,
      message,
      error: errorText,
      statusCode: status,
    });
  }
}
