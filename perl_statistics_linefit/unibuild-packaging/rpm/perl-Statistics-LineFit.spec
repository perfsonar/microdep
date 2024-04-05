%{!?perl_vendorlib: %define perl_vendorlib %(eval "`%{__perl} -V:installvendorlib`"; echo $installvendorlib)}

Name:           perl-Statistics-LineFit
Version:        0.07
Release:        1%{?dist}
Summary:        Least squares line fit, weighted or unweighted
License:        Distributable, see LICENSE
Group:          Development/Libraries
URL:            http://search.cpan.org/dist/Statistics-LineFit/
Source0:        Statistics-LineFit-%{version}.tar.gz 
BuildRoot:      %{_tmppath}/%{name}-%{version}-%{release}-root-%(%{__id_u} -n)
BuildArch:      noarch
BuildRequires:  perl(ExtUtils::MakeMaker)
BuildRequires:  perl(Test::Simple) >= 0.44

Provides:       perl(Statistics::LineFit)

%description
The Statistics::LineFit module does weighted or unweighted least-squares
line fitting to two-dimensional data (y = a + b * x). (This is also called
linear regression.) In addition to the slope and y-intercept, the module
can return the square of the correlation coefficient (R squared), the Durbin-
Watson statistic, the mean squared error, sigma, the t statistics, the
variance of the estimates of the slope and y-intercept, the predicted y
values and the residuals of the y values. (See the METHODS section for a
description of these statistics.)

%prep
%setup -q -n Statistics-LineFit-%{version}

%build
%{__perl} Makefile.PL INSTALLDIRS=vendor
make %{?_smp_mflags}

%install
rm -rf %{buildroot}

make pure_install PERL_INSTALL_ROOT=%{buildroot}

find %{buildroot} -type f -name .packlist -exec rm -f {} \;
find %{buildroot} -depth -type d -exec rmdir {} 2>/dev/null \;

%{_fixperms} %{buildroot}/*

%check || :
make test

%clean
rm -rf %{buildroot}

%files
%defattr(-,root,root,-)
%doc Changes LICENSE README Todo
%{perl_vendorlib}/*
%{_mandir}/man3/*

%changelog
* Fri Apr 05 2024 Otto J Wittner <otto.wittner@sikt.no> 0.07-1
- Specfile autogenerated by cpanspec 1.78.
