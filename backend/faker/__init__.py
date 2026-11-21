import random

class _Unique:
    def __init__(self):
        self._email_counter = 0
        self._email_set = set()
    def email(self):
        while True:
            self._email_counter += 1
            email = f"user{self._email_counter}@example.com"
            if email not in self._email_set:
                self._email_set.add(email)
                return email

class Faker:
    def __init__(self):
        self.unique = _Unique()
    def name(self):
        return f"Test User {random.randint(1, 1000)}"
    def phone_number(self):
        return f"+1-555-{random.randint(1000,9999)}"
    def bs(self):
        class _Bs:
            def title(self):
                return "Test Business"
        return _Bs()
    def job(self):
        return "Test Job"
    def bothify(self, text=''):
        result = ''
        for ch in text:
            if ch == '?':
                result += random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
            elif ch == '#':
                result += str(random.randint(0, 9))
            else:
                result += ch
        return result
    def random_int(self, min=0, max=100):
        return random.randint(min, max)
