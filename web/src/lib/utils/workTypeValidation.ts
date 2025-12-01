import { NextResponse } from 'next/server';
import { incomeCategories, IncomeMainCategory } from '@/types/income';
import { expensesCategories, ExpenseCategory } from '@/types/expenses';

export function validateWorkTypeForCategory(
  workTypes: string[],
  category: IncomeMainCategory | ExpenseCategory,
  isIncome: boolean = true
): void {
  // Get the category data from the appropriate array
  const categoryData = isIncome
    ? incomeCategories.find(cat => cat.value === category)
    : expensesCategories.find(cat => cat.value === category);

  // If category not found, throw an error
  if (!categoryData) {
    throw new Error(`${isIncome ? 'Income' : 'Expense'} category not found.`);
  }

  // Check if any of the user's workTypes are in the allowed workTypes for this category
  const isWorkTypeAllowed = categoryData.workTypes.some(type =>
    workTypes.includes(type)
  );

  if (!isWorkTypeAllowed) {
    // Get the workTypes as a comma-separated string for the error message
    const allowedWorkTypes = categoryData.workTypes.join(', ');
    const userWorkTypes = workTypes.join(', ');
    const message = `This ${isIncome ? 'income' : 'expense'} category is only available for: ${allowedWorkTypes}. Your current work types are: ${userWorkTypes}.`;

    throw NextResponse.json(
      { error: 'Validation failed', message },
      { status: 400 }
    );
  }
}
