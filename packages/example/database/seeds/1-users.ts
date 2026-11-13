import { UserService } from '../../src/services.ts';

export const seed = async (): Promise<void> => {
  await UserService.create({ name: 'John Doe', email: 'john.doe@gmail.com', password: 'example-password' });
};
