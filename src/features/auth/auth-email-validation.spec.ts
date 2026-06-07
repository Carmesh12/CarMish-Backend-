import { validate } from 'class-validator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SignupUserDto } from './dto/signup-user.dto';
import { SignupVendorDto } from './dto/signup-vendor.dto';

const invalidEmails = ['abc', 'test', 'user@', '@gmail.com'];

async function expectEmailAccepted(dto: object) {
  const errors = await validate(
    Object.assign(dto, { email: 'user@example.com' }),
  );

  expect(errors).toEqual([]);
}

async function expectInvalidEmailsRejected(
  createDto: (email: string) => object,
) {
  for (const email of invalidEmails) {
    const errors = await validate(createDto(email));
    const emailError = errors.find((error) => error.property === 'email');

    expect(emailError?.constraints).toMatchObject({
      isEmail: 'Please enter a valid email address',
    });
  }
}

describe('auth DTO email validation', () => {
  it('accepts valid login email and rejects invalid login emails', async () => {
    await expectEmailAccepted(
      Object.assign(new LoginDto(), {
        password: 'password123',
      }),
    );

    await expectInvalidEmailsRejected((email) =>
      Object.assign(new LoginDto(), {
        email,
        password: 'password123',
      }),
    );
  });

  it('accepts valid user signup email and rejects invalid user signup emails', async () => {
    await expectEmailAccepted(
      Object.assign(new SignupUserDto(), {
        password: 'password123',
        firstName: 'Jane',
        lastName: 'Doe',
        phoneNumber: '0790000000',
        city: 'Amman',
      }),
    );

    await expectInvalidEmailsRejected((email) =>
      Object.assign(new SignupUserDto(), {
        email,
        password: 'password123',
        firstName: 'Jane',
        lastName: 'Doe',
        phoneNumber: '0790000000',
        city: 'Amman',
      }),
    );
  });

  it('accepts valid vendor signup email and rejects invalid vendor signup emails', async () => {
    await expectEmailAccepted(
      Object.assign(new SignupVendorDto(), {
        password: 'password123',
        businessName: 'Car Dealer',
        contactPersonName: 'Jane Doe',
      }),
    );

    await expectInvalidEmailsRejected((email) =>
      Object.assign(new SignupVendorDto(), {
        email,
        password: 'password123',
        businessName: 'Car Dealer',
        contactPersonName: 'Jane Doe',
      }),
    );
  });

  it('accepts valid forgot-password email and rejects invalid forgot-password emails', async () => {
    await expectEmailAccepted(new ForgotPasswordDto());

    await expectInvalidEmailsRejected((email) =>
      Object.assign(new ForgotPasswordDto(), { email }),
    );
  });

  it('accepts valid resend-verification email and rejects invalid resend-verification emails', async () => {
    await expectEmailAccepted(new ResendVerificationDto());

    await expectInvalidEmailsRejected((email) =>
      Object.assign(new ResendVerificationDto(), { email }),
    );
  });
});
